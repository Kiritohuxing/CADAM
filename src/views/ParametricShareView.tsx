import ParametricView from './ParametricView';
import { useQuery } from '@tanstack/react-query';
import { Message } from '@shared/types';
import { supabase } from '@/lib/supabase';
import { useEffect, useMemo, useState } from 'react';
import { useConversation } from '@/contexts/ConversationContext';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import Tree from '@shared/Tree';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export default function ParametricShareView() {
  const { conversation } = useConversation();
  // Brand fallback used only when OFF parsing fails and we render the
  // single-color STL mesh.
  const color = '#00A6FF';
  const [currentOutput, setCurrentOutput] = useState<Blob | undefined>();
  const { setCurrentMessage } = useCurrentMessage();
  const isTabletOrMobile = useMediaQuery('(max-width: 1024px)');

  const { data: messages } = useQuery<Message[]>({
    queryKey: ['share-messages', conversation.id],
    initialData: [],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }
      return data.map((message) => ({
        ...message,
        created_at: message.created_at ?? new Date().toISOString(),
        content: message.content as Message['content'],
        role: message.role as Message['role'],
      }));
    },
  });

  const lastMessage = useMemo(() => {
    if (conversation.current_message_leaf_id) {
      return messages.find(
        (msg) => msg.id === conversation.current_message_leaf_id,
      );
    }
    return messages[messages.length - 1];
  }, [messages, conversation.current_message_leaf_id]);

  const messageTree = useMemo(() => {
    return new Tree<Message>(messages);
  }, [messages]);

  const currentMessageBranch = useMemo(() => {
    return messageTree.getPath(lastMessage?.id ?? '');
  }, [lastMessage, messageTree]);

  useEffect(() => {
    setCurrentMessage(null);
  }, [conversation.id, setCurrentMessage]);

  useEffect(() => {
    if (lastMessage?.role === 'assistant' && !isTabletOrMobile) {
      setCurrentMessage(lastMessage);
    }
  }, [lastMessage, setCurrentMessage, isTabletOrMobile]);

  return (
    <ParametricView
      color={color}
      messages={currentMessageBranch}
      isLoading={false}
      currentOutput={currentOutput}
      setCurrentOutput={setCurrentOutput}
    />
  );
}
