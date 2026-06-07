// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  getServiceRoleSupabaseClient,
  SupabaseClient,
} from '../_shared/supabaseClient.ts';
import { logApiError, logError } from '../_shared/sentry.ts';

type CancellationFeedback =
  | 'customer_service'
  | 'low_quality'
  | 'missing_features'
  | 'other'
  | 'switched_service'
  | 'too_expensive'
  | 'too_complex'
  | 'unused';

const supabaseClient = getServiceRoleSupabaseClient();

/**
 * Deletes the authenticated user account.
 * - Removes storage items in the background
 * - Deletes the auth user via service role
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { reason }: { reason?: CancellationFeedback } = await req
    .json()
    .catch(() => ({}));

  console.log('Delete user reason:', reason);

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser(token);

  if (userError || !userData.user || !userData.user.email) {
    logError(userError ?? new Error('No user in request token'), {
      functionName: 'delete-user',
      statusCode: 401,
    });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = userData.user.id;
  const email = userData.user.email;

  // Kick off storage deletion in the background to avoid blocking the response
  EdgeRuntime.waitUntil(deleteUserStorageItems(userId));

  // Delete the auth user via service role
  const { error: deleteUserError } =
    await supabaseClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error(deleteUserError);
    logError(deleteUserError, {
      functionName: 'delete-user',
      statusCode: 500,
      userId,
      additionalContext: { step: 'auth_admin_delete' },
    });
    return new Response(JSON.stringify({ error: 'Failed to delete user' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// Helper: delete all files for this user from storage buckets
async function deleteUserStorageItems(userIdToDelete: string) {
  const buckets = ['images', 'meshes', 'previews'];
  for (const bucket of buckets) {
    try {
      const paths = await listAllPaths(supabaseClient, bucket, userIdToDelete);
      if (paths.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < paths.length; i += batchSize) {
          const slice = paths.slice(i, i + batchSize);
          const { error: removeError } = await supabaseClient.storage
            .from(bucket)
            .remove(slice);
          if (removeError) throw removeError;
        }
      }
    } catch (err) {
      // Log to Sentry but do not block the main request
      logError(err, {
        functionName: 'delete-user',
        statusCode: 500,
        userId: userIdToDelete,
        additionalContext: { step: 'storage_delete', bucket },
      });
    }
  }
}

// Helper: list all paths in a storage bucket for a given user
async function listAllPaths(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
): Promise<string[]> {
  const allPaths: string[] = [];
  let pageToken: string | undefined;

  do {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(userId, {
        limit: 1000,
        search: pageToken ? undefined : undefined,
      });

    if (error) throw error;
    if (data) {
      allPaths.push(...data.map((item) => `${userId}/${item.name}`));
    }

    pageToken = undefined;
  } while (pageToken);

  return allPaths;
}
