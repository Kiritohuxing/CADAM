import { useConversation } from '@/contexts/ConversationContext';
import { supabase } from '@/lib/supabase';
import { Content, Conversation, Message, Model } from '@shared/types';
import { HistoryConversation } from '../types/misc.ts';
import {
  QueryClient,
  UseMutateAsyncFunction,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

function messageSentConversationUpdate(
  newMessage: Message,
  conversationId: string,
) {
  return (
    oldConversations: Conversation[] | HistoryConversation[] | undefined,
  ) => {
    if (!oldConversations) return oldConversations;
    return oldConversations
      .map((conv) => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            current_message_leaf_id: newMessage.id,
            updated_at: newMessage.created_at,
          };
        }
        return conv;
      })
      .sort((a: Conversation, b: Conversation) => {
        return (
          new Date(b.updated_at ?? '').getTime() -
          new Date(a.updated_at ?? '').getTime()
        );
      });
  };
}

function messageInsertedConversationUpdate(
  queryClient: QueryClient,
  newMessage: Message,
  conversationId: string,
) {
  queryClient.setQueryData(
    ['conversation', conversationId],
    (oldConversation: Conversation) => ({
      ...oldConversation,
      current_message_leaf_id: newMessage.id,
    }),
  );

  queryClient.setQueryData(
    ['messages', conversationId],
    (oldMessages: Message[] | undefined) => {
      if (!oldMessages || oldMessages.length === 0) return [newMessage];
      if (oldMessages.find((msg) => msg.id === newMessage.id)) {
        return oldMessages.map((msg) =>
          msg.id === newMessage.id ? newMessage : msg,
        );
      }
      return [...oldMessages, newMessage];
    },
  );

  queryClient.setQueryData(
    ['conversations'],
    messageSentConversationUpdate(newMessage, conversationId),
  );

  queryClient.setQueryData(
    ['conversations', 'recent'],
    messageSentConversationUpdate(newMessage, conversationId),
  );
}

export const useMessagesQuery = () => {
  const { conversation } = useConversation();
  return useQuery<Message[]>({
    enabled: !!conversation.id,
    queryKey: ['messages', conversation.id],
    initialData: [],
    queryFn: async () => {
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .overrideTypes<
          Array<{ content: Content; role: 'user' | 'assistant' }>
        >();

      if (messagesError) throw messagesError;

      const assistantMessages = messagesData?.filter(m => m.role === 'assistant') || [];
      console.log('[useMessagesQuery] fetched messages:', messagesData?.length);
      console.log('[useMessagesQuery] assistant messages:', assistantMessages.length);
      if (assistantMessages.length > 0) {
        console.log('[useMessagesQuery] first assistant message content:', assistantMessages[0].content);
      }

      return messagesData || [];
    },
  });
};

export function useInsertMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      message: Omit<Message, 'id' | 'created_at' | 'rating'>,
    ) => {
      const { data, error } = await supabase
        .from('messages')
        .insert([{ ...message }])
        .select()
        .single()
        .overrideTypes<{ content: Content; role: 'assistant' }>();

      if (error) throw error;

      return data;
    },
    onSuccess(newMessage) {
      messageInsertedConversationUpdate(
        queryClient,
        newMessage,
        newMessage.conversation_id,
      );
    },
    onError(error, message) {
      Sentry.captureException(error, {
        extra: {
          hook: 'useInsertMessageMutation',
          message,
        },
      });
    },
  });
}

export function useCreativeChatMutation({
  conversationId,
}: {
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  return useMutation({
    mutationKey: ['creative-chat', conversationId],
    mutationFn: async ({
      model,
      messageId,
      conversationId,
    }: {
      model: Model;
      messageId: string;
      conversationId: string;
    }) => {
      const newMessageId = crypto.randomUUID();

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("No access token found, please log in again");
      }

      console.log('Starting creative chat request...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creative-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversationId,
            messageId,
            model,
            newMessageId,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }

      console.log('Receiving JSON response...');

      // ========================================
      // 🚀 新架构：接收 JSON 响应
      // ========================================
      const finalMessage: Message = await response.json();
      
      console.log('Received message:', {
        id: finalMessage.id,
        hasText: !!finalMessage.content?.text,
        hasCode: !!finalMessage.content?.openscadCode
      });

      // 更新 conversation
      queryClient.setQueryData(
        ['conversation', conversationId],
        (oldConversation: Conversation) => ({
          ...oldConversation,
          current_message_leaf_id: newMessageId,
        }),
      );

      // 更新 messages 缓存
      queryClient.setQueryData(
        ['messages', conversationId],
        (oldMessages: Message[] | undefined) => {
          if (!oldMessages || oldMessages.length === 0) {
            return [finalMessage];
          }
          const existingIndex = oldMessages.findIndex((msg) => msg.id === finalMessage.id);
          if (existingIndex >= 0) {
            return oldMessages.map((msg, idx) => 
              idx === existingIndex ? finalMessage : msg
            );
          } else {
            return [...oldMessages, finalMessage];
          }
        },
      );

      return finalMessage;
    },
    onSuccess: (newMessage) => {
      messageInsertedConversationUpdate(
        queryClient,
        newMessage,
        conversationId,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userExtraData'] });
    },
    onError: async (error, { messageId }) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'Unknown';
      
      console.error('useCreativeChatMutation error:', {
        message: errorMessage,
        name: errorName,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      if (errorName === 'AbortError') {
        console.warn('Request was aborted - this may be due to component unmount or navigation');
        return;
      }
      
      Sentry.captureException(error, {
        extra: {
          hook: 'useCreativeChatMutation',
          messageId,
          conversationId,
          errorMessage,
        },
      });
      try {
        await insertMessageAsync({
          role: 'assistant',
          content: {
            text: `Error: ${errorMessage}`,
          },
          parent_message_id: messageId,
          conversation_id: conversationId,
        });
      } catch (error) {
        Sentry.captureException(error, {
          extra: {
            hook: 'useCreativeChatMutation insertMessageAsync',
            messageId,
            conversationId,
          },
        });
      }
    },
  });
}

export function useParametricChatMutation({
  conversationId,
}: {
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  return useMutation({
    mutationKey: ['parametric-chat', conversationId],
    mutationFn: async ({
      model,
      messageId,
      conversationId,
    }: {
      model: Model;
      messageId: string;
      conversationId: string;
    }) => {
      const newMessageId = crypto.randomUUID();
      let initialized = false;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("No access token found, please log in again");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parametric-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversationId,
            messageId,
            model,
            newMessageId,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      if (response.body === null) {
        throw new Error('No response body available');
      }

      async function initialize() {
        await queryClient.cancelQueries({
          queryKey: ['conversation', conversationId],
        });
        queryClient.setQueryData(
          ['conversation', conversationId],
          (oldConversation: Conversation) => ({
            ...oldConversation,
            current_message_leaf_id: newMessageId,
          }),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalMessage: Message | null = null;

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) return;
        
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]' || jsonStr === '') return;

        try {
          const data: Message = JSON.parse(jsonStr);
          finalMessage = data;

          queryClient.setQueryData(
            ['messages', conversationId],
            (oldMessages: Message[] | undefined) => {
              if (!oldMessages || oldMessages.length === 0) {
                return [data];
              }
              const existingIndex = oldMessages.findIndex((msg) => msg.id === data.id);
              if (existingIndex >= 0) {
                return oldMessages.map((msg, idx) => 
                  idx === existingIndex ? data : msg
                );
              } else {
                return [...oldMessages, data];
              }
            },
          );

          if (!initialized) {
            initialize();
            initialized = true;
          }
        } catch (parseError) {
          console.debug('Parsing chunk (expected):', jsonStr);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            processLine(line);
          }
        }

        if (buffer.trim()) {
          processLine(buffer);
        }
      } finally {
        reader.releaseLock();
      }

      if (!finalMessage) {
        throw new Error('No final message received');
      }

      return finalMessage;
    },
    onSuccess: (newMessage) => {
      messageInsertedConversationUpdate(
        queryClient,
        newMessage,
        conversationId,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userExtraData'] });
    },
    onError: async (error, { messageId }) => {
      Sentry.captureException(error, {
        extra: {
          hook: 'useParametricChatMutation',
          messageId,
          conversationId,
        },
      });
      try {
        await insertMessageAsync({
          role: 'assistant',
          content: {
            text: 'An error occurred while processing your request.',
          },
          parent_message_id: messageId,
          conversation_id: conversationId,
        });
      } catch (error) {
        Sentry.captureException(error, {
          extra: {
            hook: 'useParametricChatMutation insertMessageAsync',
            messageId,
            conversationId,
          },
        });
      }
    },
  });
}

export function useSendContentMutation({
  conversation,
}: {
  conversation: Pick<
    Conversation,
    'id' | 'user_id' | 'settings' | 'current_message_leaf_id' | 'type'
  >;
}) {
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();
  const { mutateAsync: sendToCreativeChat } = useCreativeChatMutation({
    conversationId: conversation.id,
  });

  const { mutateAsync: sendToParametricChat } = useParametricChatMutation({
    conversationId: conversation.id,
  });

  return useMutation({
    mutationKey: ['send-content', conversation.id],
    mutationFn: async (content: Content) => {
      const databaseOperations = [];

      if (content.images && content.images.length > 0) {
        const imageOperations = content.images.map(async (imageId) => {
          const { error: imageError } = await supabase.from('images').upsert(
            {
              id: imageId,
              prompt: {
                text: 'User uploaded image',
              },
              status: 'success',
              user_id: conversation.user_id,
              conversation_id: conversation.id,
            },
            {
              onConflict: 'id',
              ignoreDuplicates: true,
            },
          );

          if (imageError) throw imageError;
        });
        databaseOperations.push(...imageOperations);
      }

      if (content.mesh) {
        const meshOperation = supabase
          .from('meshes')
          .upsert(
            {
              id: content.mesh.id,
              conversation_id: conversation.id,
              user_id: conversation.user_id,
              status: 'success',
              prompt: {
                text: 'User uploaded mesh',
              },
              file_type: content.mesh.fileType,
            },
            {
              onConflict: 'id',
              ignoreDuplicates: true,
            },
          )
          .then(({ error: meshError }) => {
            if (meshError) throw meshError;
          });

        databaseOperations.push(meshOperation);
      }

      await Promise.all(databaseOperations);

      const userMessage = await insertMessageAsync({
        role: 'user',
        content,
        parent_message_id: conversation.current_message_leaf_id ?? null,
        conversation_id: conversation.id,
      });

      if (conversation.type === 'creative') {
        await sendToCreativeChat({
          model: content.model ?? conversation.settings?.model ?? 'quality',
          messageId: userMessage.id,
          conversationId: conversation.id,
        });
      } else {
        await sendToParametricChat({
          model: content.model ?? conversation.settings?.model ?? 'fast',
          messageId: userMessage.id,
          conversationId: conversation.id,
        });
      }
    },
  });
}

export function useUpdateMessageOptimisticMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ message }: { message: Message }) => {
      const { data: updatedMessage, error: messageError } = await supabase
        .from('messages')
        .update({
          content: message.content,
          rating: message.rating,
        })
        .eq('id', message.id)
        .eq('conversation_id', message.conversation_id)
        .select()
        .single();

      if (messageError) throw messageError;

      return updatedMessage as Message;
    },
    onMutate: async ({ message }) => {
      await queryClient.cancelQueries({
        queryKey: ['messages', message.conversation_id],
      });
      const oldMessages = queryClient.getQueryData<Message[]>([
        'messages',
        message.conversation_id,
      ]);
      queryClient.setQueryData(
        ['messages', message.conversation_id],
        oldMessages?.map((msg) =>
          msg.id === message.id ? { ...msg, ...message } : msg,
        ),
      );
      return { oldMessages };
    },
    onSettled(_data, _error, { message }) {
      queryClient.invalidateQueries({
        queryKey: ['messages', message.conversation_id],
      });
    },
    onError(error, { message }, context) {
      Sentry.captureException(error, {
        extra: {
          hook: 'useUpdateMessageOptimisticMutation',
          message,
        },
      });
      queryClient.setQueryData(
        ['messages', message.conversation_id],
        context?.oldMessages,
      );
    },
  });
}

export function useEditMessageMutation({
  conversation,
}: {
  conversation: Conversation;
}) {
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  const { mutateAsync: sendToCreativeChat } = useCreativeChatMutation({
    conversationId: conversation.id,
  });

  const { mutateAsync: sendToParametricChat } = useParametricChatMutation({
    conversationId: conversation.id,
  });

  return useMutation({
    mutationKey: ['edit-message', conversation.id],
    mutationFn: async (updatedMessage: Message) => {
      const userMessage = await insertMessageAsync({
        role: updatedMessage.role,
        content: updatedMessage.content,
        parent_message_id: updatedMessage.parent_message_id ?? null,
        conversation_id: conversation.id,
      });

      if (conversation.type === 'creative') {
        sendToCreativeChat({
          model: conversation.settings?.model ?? 'quality',
          messageId: userMessage.id,
          conversationId: conversation.id,
        });
      } else {
        sendToParametricChat({
          model: conversation.settings?.model ?? 'fast',
          messageId: userMessage.id,
          conversationId: conversation.id,
        });
      }
    },
    onError: (error, updatedMessage) => {
      Sentry.captureException(error, {
        extra: {
          hook: 'useEditMessageMutation',
          updatedMessage,
          conversationId: conversation.id,
        },
      });
    },
  });
}

export function useRetryMessageMutation({
  conversation,
  updateConversationAsync,
}: {
  conversation: Conversation;
  updateConversationAsync?: UseMutateAsyncFunction<
    Conversation,
    Error,
    Conversation
  >;
}) {
  const { mutateAsync: sendToCreativeChat } = useCreativeChatMutation({
    conversationId: conversation.id,
  });

  const { mutateAsync: sendToParametricChat } = useParametricChatMutation({
    conversationId: conversation.id,
  });

  return useMutation({
    mutationKey: ['retry-message', conversation.id],
    mutationFn: async ({ model, id }: { model: Model; id: string }) => {
      if (!updateConversationAsync) {
        throw new Error('Cannot update conversation');
      }

      await updateConversationAsync({
        ...conversation,
        settings: {
          ...(typeof conversation.settings === 'object'
            ? conversation.settings
            : {}),
          model: model,
        },
        current_message_leaf_id: id,
      });

      if (conversation.type === 'creative') {
        sendToCreativeChat({
          model: model,
          messageId: id,
          conversationId: conversation.id,
        });
      } else {
        sendToParametricChat({
          model: model,
          messageId: id,
          conversationId: conversation.id,
        });
      }
    },
    onError: (error, { model, id }) => {
      Sentry.captureException(error, {
        extra: {
          hook: 'useRetryMessageMutation',
          conversationId: conversation.id,
          model,
          id,
        },
      });
    },
  });
}

export function useRestoreMessageMutation() {
  const { mutateAsync: insertMessageAsync } = useInsertMessageMutation();

  return useMutation({
    mutationFn: async (messageToRestore: Message) => {
      await insertMessageAsync({
        role: messageToRestore.role,
        content: messageToRestore.content,
        parent_message_id: messageToRestore.parent_message_id ?? null,
        conversation_id: messageToRestore.conversation_id,
      });
    },
    onError: (error, messageToRestore) => {
      Sentry.captureException(error, {
        extra: {
          hook: 'useRestoreMessageMutation',
          messageToRestore,
        },
      });
    },
  });
}

export function useChangeRatingMutation({
  conversationId,
}: {
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const { mutateAsync: updateMessageOptimistic } =
    useUpdateMessageOptimisticMutation();

  const messages = queryClient.getQueryData<Message[]>([
    'messages',
    conversationId,
  ]);

  return useMutation({
    mutationKey: ['change-rating', conversationId],
    mutationFn: async ({
      messageId,
      rating,
    }: {
      messageId: string;
      rating: number;
    }) => {
      const oldMessage = messages?.find((msg) => msg.id === messageId);
      if (!oldMessage) return;
      updateMessageOptimistic({ message: { ...oldMessage, rating } });
    },
  });
}

export function useUpscaleMutation({
  conversation,
  updateConversationAsync,
}: {
  conversation: Conversation;
  updateConversationAsync?: (conversation: Conversation) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['upscale', conversation.id],
    mutationFn: async ({
      meshId,
      parentMessageId,
    }: {
      meshId: string;
      parentMessageId: string | null;
    }) => {
      if (parentMessageId && updateConversationAsync) {
        await updateConversationAsync({
          ...conversation,
          current_message_leaf_id: parentMessageId,
        });
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mesh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${
              (await supabase.auth.getSession()).data.session?.access_token
            }`,
          },
          body: JSON.stringify({
            action: 'upscale',
            meshId,
            conversationId: conversation.id,
            parentMessageId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to upscale');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder();
      let leftover = '';
      let finalMessage: Message | null = null;
      let initialized = false;

      async function initialize(messageId: string) {
        await queryClient.cancelQueries({
          queryKey: ['conversation', conversation.id],
        });
        queryClient.setQueryData(
          ['conversation', conversation.id],
          (oldConversation: Conversation) => ({
            ...oldConversation,
            current_message_leaf_id: messageId,
          }),
        );
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        leftover += decoder.decode(value, { stream: true });
        const lines = leftover.split('\n');
        leftover = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          try {
            const data: Message = JSON.parse(line);
            finalMessage = data;

            queryClient.setQueryData(
              ['messages', conversation.id],
              (oldMessages: Message[] | undefined) => {
                if (!oldMessages || oldMessages.length === 0) {
                  return [data];
                }
                if (oldMessages.find((msg) => msg.id === data.id)) {
                  return oldMessages.map((msg) =>
                    msg.id === data.id ? data : msg,
                  );
                } else {
                  return [...oldMessages, data];
                }
              },
            );

            if (!initialized && data.id) {
              await initialize(data.id);
              initialized = true;
            }
          } catch (parseError) {
            console.error('Error parsing streaming data:', parseError);
          }
        }
      }

      const tail = leftover.trim();
      if (tail) {
        try {
          const data: Message = JSON.parse(tail);
          finalMessage = data;
          queryClient.setQueryData(
            ['messages', conversation.id],
            (oldMessages: Message[] | undefined) => {
              if (!oldMessages || oldMessages.length === 0) {
                return [data];
              }
              if (oldMessages.find((msg) => msg.id === data.id)) {
                return oldMessages.map((msg) =>
                  msg.id === data.id ? data : msg,
                );
              } else {
                return [...oldMessages, data];
              }
            },
          );
        } catch (parseError) {
          console.error('Error parsing final streaming data:', parseError);
        }
      }

      reader.releaseLock();
      return finalMessage;
    },
    onError: (error) => {
      Sentry.captureException(error, {
        extra: {
          hook: 'useUpscaleMutation',
          conversationId: conversation.id,
        },
      });
    },
  });
}