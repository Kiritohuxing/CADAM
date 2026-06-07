import { useEffect, useMemo, useRef, useCallback } from 'react';
import { Content, Message } from '@shared/types';
import { CreativeView } from './CreativeView';
import { useConversation } from '@/contexts/ConversationContext';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import {
  useMessagesQuery,
  useSendContentMutation,
  useEditMessageMutation,
  useRetryMessageMutation,
  useRestoreMessageMutation,
  useChangeRatingMutation,
  useUpscaleMutation,
} from '@/services/messageService';
import { useIsMobile } from '@/hooks/useIsMobile';
import Tree from '@shared/Tree';
import { useIsMutating } from '@tanstack/react-query';
import { useRequestCancellation } from '@/hooks/useRequestCancellation';

export function CreativeEditorView() {
  const { conversation, updateConversationAsync } = useConversation();
  const { setCurrentMessage } = useCurrentMessage();
  const isMobile = useIsMobile();
  const { cancelRequest } = useRequestCancellation();

  // Track the current processing message ID for cancellation
  const currentProcessingMessageRef = useRef<string | null>(null);

  const { mutate: sendMessageMutation, isPending: isSendingMessage } =
    useSendContentMutation({
      conversation,
    });

  const { mutate: editMessage, isPending: isEditingMessage } =
    useEditMessageMutation({ conversation });

  const { mutate: retryMessage, isPending: isRetryingMessage } =
    useRetryMessageMutation({
      conversation,
      updateConversationAsync,
    });

  const { mutate: restoreMessage } = useRestoreMessageMutation();

  const { mutate: changeRating } = useChangeRatingMutation({
    conversationId: conversation.id,
  });

  const { mutate: upscaleMessage, isPending: isUpscalingMessage } =
    useUpscaleMutation({ conversation, updateConversationAsync });

  const isSending = useIsMutating({
    mutationKey: ['creative-chat', conversation.id],
  });

  const isLoading =
    !!isSending ||
    isSendingMessage ||
    isRetryingMessage ||
    isEditingMessage ||
    isUpscalingMessage;

  const { data: messages = [] } = useMessagesQuery();

  console.log('[CreativeEditorView] messages count:', messages.length);
  console.log('[CreativeEditorView] conversation.id:', conversation.id);
  console.log('[CreativeEditorView] conversation.type:', conversation.type);
  console.log('[CreativeEditorView] conversation.current_message_leaf_id:', conversation.current_message_leaf_id);

  const lastMessage = useMemo(() => {
    if (conversation.current_message_leaf_id) {
      const found = messages.find(
        (msg) => msg.id === conversation.current_message_leaf_id,
      );
      console.log('[CreativeEditorView] found message by current_message_leaf_id:', !!found);
      return found;
    }
    const last = messages[messages.length - 1];
    console.log('[CreativeEditorView] last message from array:', !!last);
    return last;
  }, [messages, conversation.current_message_leaf_id]);

  const messageTree = useMemo(() => {
    return new Tree<Message>(messages);
  }, [messages]);

  const currentMessageBranch = useMemo(() => {
    const branch = messageTree.getPath(lastMessage?.id ?? '');
    console.log('[CreativeEditorView] currentMessageBranch count:', branch.length);
    
    // 如果分支为空或不完整（少于总消息数的一半），回退到显示所有消息
    if (branch.length === 0 || (messages.length > 0 && branch.length < messages.length)) {
      console.log('[CreativeEditorView] Falling back to all messages due to incomplete branch');
      return Array.from(messageTree.allNodes.values());
    }
    
    return branch;
  }, [lastMessage, messageTree, messages]);

  // Track the current request's user message ID for cancellation
  useEffect(() => {
    if (isLoading && lastMessage) {
      // If assistant is streaming, use its parent (the user message)
      const cancellationId =
        lastMessage.role === 'assistant'
          ? lastMessage.parent_message_id || null
          : lastMessage.id;
      currentProcessingMessageRef.current = cancellationId;
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
    if (lastMessage?.role === 'assistant' && !isMobile) {
      setCurrentMessage(lastMessage);
    }
  }, [lastMessage, setCurrentMessage, isMobile]);

  const sendMessage = useCallback(
    (content: Content) => {
      sendMessageMutation(content);
    },
    [sendMessageMutation],
  );

  return (
    <CreativeView
      messages={currentMessageBranch}
      isLoading={isLoading}
      sendMessage={sendMessage}
      stopGenerating={stopGenerating}
      restoreMessage={restoreMessage}
      retryMessage={retryMessage}
      editMessage={editMessage}
      changeRating={changeRating}
      upscaleMessage={upscaleMessage}
    />
  );
}
