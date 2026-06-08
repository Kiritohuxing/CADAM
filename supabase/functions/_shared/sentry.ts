export function initSentry() {
  console.log('[Sentry] Disabled - not configured');
}

export function logError(
  error: Error | unknown,
  context: {
    functionName: string;
    statusCode: number;
    userId?: string;
    conversationId?: string;
    additionalContext?: Record<string, unknown>;
  },
) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[${context.functionName}] Error (${context.statusCode}):`, {
    error: errorMessage,
    stack: errorStack,
    userId: context.userId,
    conversationId: context.conversationId,
    additionalContext: context.additionalContext,
  });
}

export function logApiError(
  error: Error | unknown,
  context: {
    functionName: string;
    apiName: string;
    statusCode: number;
    userId?: string;
    conversationId?: string;
    requestData?: Record<string, unknown>;
  },
) {
  logError(error, {
    functionName: context.functionName,
    statusCode: context.statusCode,
    userId: context.userId,
    conversationId: context.conversationId,
    additionalContext: {
      apiName: context.apiName,
      requestData: context.requestData,
    },
  });
}
// @author Kiritohuxing
