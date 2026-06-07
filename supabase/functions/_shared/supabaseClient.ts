import {
  createClient,
  SupabaseClient as DefaultSupabaseClient,
  SupabaseClientOptions,
} from 'https://esm.sh/@supabase/supabase-js@2.49.9';
import { Database } from '@shared/database.ts';

export type SupabaseClient = DefaultSupabaseClient<Database>;

function getSupabaseUrl(): string {
  const url = Deno.env.get('LOCAL_SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  // Edge Functions 运行在 Docker 容器中，需要使用 host.docker.internal 访问宿主机
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    // Windows 和 Mac 使用 host.docker.internal，Linux 可能需要使用网桥 IP
    return url.replace('127.0.0.1', 'host.docker.internal').replace('localhost', 'host.docker.internal');
  }
  return url;
}

export function getServiceRoleSupabaseClient(
  options?: SupabaseClientOptions<'public'>,
): SupabaseClient {
  return createClient<Database, 'public', Database['public']>(
    getSupabaseUrl(),
    Deno.env.get('SERVICE_ROLE_KEY') ?? '',
    {
      ...options,
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

export function getAnonSupabaseClient(
  options?: SupabaseClientOptions<'public'>,
): SupabaseClient {
  return createClient<Database, 'public', Database['public']>(
    getSupabaseUrl(),
    Deno.env.get('LOCAL_SUPABASE_ANON_KEY') ?? '',
    options,
  );
}
