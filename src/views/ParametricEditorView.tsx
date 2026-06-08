import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Content, Message } from '@shared/types';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import ParametricView from './ParametricView';
import { useConversation } from '@/contexts/ConversationContext';
import OpenSCADError from '@/lib/OpenSCADError';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import { useEditMessageMutation,
  useMessagesQuery,
  useRestoreMessageMutation,
  useRetryMessageMutation,
  useSendContentMutation,
  useUpdateMessageOptimisticMutation,
  useChangeRatingMutation,
} from '@/services/messageService';
import Tree from '@shared/Tree';
import { useRequestCancellation } from '@/hooks/useRequestCancellation';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export function ParametricEditorView() {
  const { conversation, updateConversationAsync } = useConversation();
  const queryClient = useQueryClient();
  const { currentMessage, setCurrentMessage } = useCurrentMessage();
  const totalTokens = 0;
  const [currentOutput, setCurrentOutput] = useState<Blob | undefined>();
  // Brand fallback color used when OFF parsing fails and we drop back to
  // the single-color STL mesh.
  const color = '#00A6FF';
  const { cancelRequest } = useRequestCancellation();
  const isTabletOrMobile = useMediaQuery('(max-width: 1024px)');

  // Track the current processing message ID for cancellation
  const currentProcessingMessageRef = useRef<string | null>(null);

  const { mutate: updateMessageOptimistic } =
    useUpdateMessageOptimisticMutation();

  const { mutate: sendMessageMutation, isPending: isSendingMessage } =
    useSendContentMutation({
      conversation,
    });

  const { mutate: retryMessage, isPending: isRetryingMessage } =
    useRetryMessageMutation({
      conversation,
      updateConversationAsync,
    });

  const { mutate: editMessage, isPending: isEditingMessage } =
    useEditMessageMutation({ conversation });

  const { mutate: restoreMessage } = useRestoreMessageMutation();

  const { mutate: changeRating } = useChangeRatingMutation({
    conversationId: conversation.id,
  });

  const isSending = useIsMutating({
    mutationKey: ['parametric-chat', conversation.id],
  });

  const isLoading =
    !!isSending || isRetryingMessage || isSendingMessage || isEditingMessage;

  const { data: messages = [] } = useMessagesQuery();

  console.log('[ParametricEditorView] messages count:', messages.length);
  console.log('[ParametricEditorView] conversation.id:', conversation.id);
  console.log('[ParametricEditorView] conversation.type:', conversation.type);
  console.log('[ParametricEditorView] conversation.current_message_leaf_id:', conversation.current_message_leaf_id);

  const lastMessage = useMemo(() => {
    if (conversation.current_message_leaf_id) {
      const found = messages.find(
        (msg) => msg.id === conversation.current_message_leaf_id,
      );
      console.log('[ParametricEditorView] found message by current_message_leaf_id:', !!found);
      return found;
    }
    const last = messages[messages.length - 1];
    console.log('[ParametricEditorView] last message from array:', !!last);
    return last;
  }, [messages, conversation.current_message_leaf_id]);

  const messageTree = useMemo(() => {
    return new Tree<Message>(messages);
  }, [messages]);

  const currentMessageBranch = useMemo(() => {
    const branch = messageTree.getPath(lastMessage?.id ?? '');
    console.log('[ParametricEditorView] currentMessageBranch count:', branch.length);
    
    // 如果分支为空或不完整（少于总消息数的一半），回退到显示所有消�?    if (branch.length === 0 || (messages.length > 0 && branch.length < messages.length)) {
      console.log('[ParametricEditorView] Falling back to all messages due to incomplete branch');
      return Array.from(messageTree.allNodes.values());
    }
    
    return branch;
  }, [lastMessage, messageTree, messages]);

  // Track the last user message to get the messageId for cancellation
  useEffect(() => {
    if (lastMessage?.role === 'user' && isLoading) {
      currentProcessingMessageRef.current = lastMessage.id;
    } else if (!isLoading) {
      currentProcessingMessageRef.current = null;
    }
  }, [lastMessage, isLoading]);

  const stopGenerating = useCallback(async () => {
    if (currentProcessingMessageRef.current) {
      try {
        await cancelRequest(currentProcessingMessageRef.current);
        currentProcessingMessageRef.current = null;
      } catch (error) {
        console.error('Failed to cancel request:', error);
      }
    }
  }, [cancelRequest]);

  useEffect(() => {
    setCurrentMessage(null);
  }, [conversation.id, setCurrentMessage]);

  useEffect(() => {
    if (lastMessage?.role === 'assistant' && !isTabletOrMobile) {
      setCurrentMessage(lastMessage);
    }
  }, [lastMessage, setCurrentMessage, isTabletOrMobile]);

  const sendMessage = useCallback(
    (content: Content) => {
      sendMessageMutation(content);
    },
    [sendMessageMutation],
  );

  const fixError = useCallback(
    async (error: OpenSCADError) => {
      const newContent: Content = {
        text: 'Fix with AI',
        error: error.stdErr.join('\n'),
      };

      sendMessage(newContent);
    },
    [sendMessage],
  );

  return (
    <ParametricView
      messages={currentMessageBranch}
      sendMessage={sendMessage}
      editMessage={editMessage}
      retryMessage={retryMessage}
      isLoading={isLoading}
      currentOutput={currentOutput}
      setCurrentOutput={setCurrentOutput}
      color={color}
      stopGenerating={stopGenerating}
      fixError={currentMessage?.id === lastMessage?.id ? fixError : undefined}
      changeRating={changeRating}
      restoreMessage={restoreMessage}
      limitReached={totalTokens <= 0}
      currentMessage={lastMessage}
    />
  );
}

// @author Kiritohuxing
