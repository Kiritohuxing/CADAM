import { ChatSection } from '@/components/chat/ChatSection';
import { Content, Message, Model } from '@shared/types';
import OpenSCADError from '@/lib/OpenSCADError';
import { useRef, useState, useMemo, useCallback } from 'react';
import {
  ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { ChevronsRight } from 'lucide-react';
import { TreeNode } from '@shared/Tree';
import { ParametricPreviewSection } from '@/components/viewer/ParametricPreviewSection';

// Panel size constants
const PANEL_SIZES = {
  CHAT: {
    DEFAULT: 40,
    MIN: 384,
    MAX: 550,
  },
  PREVIEW: {
    DEFAULT: 60,
    MIN: 20,
  },
} as const;

interface ParametricViewProps {
  messages: TreeNode<Message>[];
  sendMessage?: (content: Content) => void;
  editMessage?: (message: Message) => void;
  retryMessage?: ({ model, id }: { model: Model; id: string }) => void;
  isLoading: boolean;
  currentOutput: Blob | undefined;
  setCurrentOutput: (output: Blob | undefined) => void;
  color: string;
  limitReached?: boolean;
  stopGenerating?: () => void;
  fixError?: (error: OpenSCADError) => void;
  changeRating?: (data: { messageId: string; rating: number }) => void;
  restoreMessage?: (message: Message) => void;
  currentMessage?: Message;
}

export default function ParametricView({
  messages,
  sendMessage,
  editMessage,
  retryMessage,
  isLoading,
  currentOutput,
  setCurrentOutput,
  color,
  limitReached = false,
  stopGenerating,
  fixError,
  changeRating,
  restoreMessage,
  currentMessage: propCurrentMessage,
}: ParametricViewProps) {
  const isTabletOrMobile = useMediaQuery('(max-width: 1024px)');
  const { currentMessage: contextCurrentMessage } = useCurrentMessage();
  const currentMessage = propCurrentMessage ?? contextCurrentMessage;
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Update container width on resize
  const setContainerRef = useCallback((element: HTMLDivElement) => {
    // Initial measurement
    setContainerWidth(element.offsetWidth);

    // Create ResizeObserver to watch for container size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      setContainerWidth(element.offsetWidth);
    });
    resizeObserverRef.current.observe(element);
    return () => {
      // Cleanup when element is removed
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, []);

  // Calculate panel sizes based on container width
  const chatPanelSizes = useMemo(() => {
    if (containerWidth === 0)
      return { defaultSize: 40, minSize: 0, maxSize: 100 };

    const minSize = (PANEL_SIZES.CHAT.MIN / containerWidth) * 100;
    const maxSize = (PANEL_SIZES.CHAT.MAX / containerWidth) * 100;
    const defaultSize = Math.min(
      Math.max(PANEL_SIZES.CHAT.DEFAULT, minSize),
      maxSize,
    );
    return {
      defaultSize,
      minSize,
      maxSize,
    };
  }, [containerWidth]);

  // Optimized collapse/expand handlers
  const handleChatCollapse = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      panel.collapse();
      setIsChatCollapsed(true);
    }
  }, []);

  const handleChatExpand = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      panel.expand();
      setIsChatCollapsed(false);
    }
  }, []);

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-[#292828]"
      ref={setContainerRef}
    >
      {isTabletOrMobile ? (
        <div className="relative h-full w-full">
          <ChatSection
            messages={messages ?? []}
            isLoading={isLoading}
            onSendMessage={sendMessage}
            onEdit={editMessage}
            stopGenerating={stopGenerating}
            retryMessage={retryMessage}
            changeRating={changeRating}
            restoreMessage={restoreMessage}
          />
        </div>
      ) : (
        <PanelGroup
          direction="horizontal"
          className="h-full w-full"
          autoSaveId="editor-panels"
        >
          <Panel
            collapsible
            ref={chatPanelRef}
            defaultSize={chatPanelSizes.defaultSize}
            minSize={chatPanelSizes.minSize}
            maxSize={chatPanelSizes.maxSize}
            id="chat-panel"
            order={0}
          >
            <div className="relative h-full">
              <ChatSection
                messages={messages ?? []}
                isLoading={isLoading}
                onSendMessage={sendMessage}
                onEdit={editMessage}
                stopGenerating={stopGenerating}
                retryMessage={retryMessage}
                changeRating={changeRating}
                restoreMessage={restoreMessage}
              />
            </div>
          </Panel>
          <PanelResizeHandle className="resize-handle group relative">
            {!isChatCollapsed && (
              <div className="absolute left-1 top-1/2 z-50 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  className="rounded-l-none rounded-r-lg border-b border-r border-t border-gray-200/20 bg-adam-bg-secondary-dark p-2 text-adam-text-primary transition-colors dark:border-gray-800 [@media(hover:hover)]:hover:bg-adam-neutral-950 [@media(hover:hover)]:hover:text-adam-neutral-10"
                  onClick={handleChatCollapse}
                >
                  <ChevronsRight className="h-5 w-5 rotate-180" />
                </Button>
              </div>
            )}
            {isChatCollapsed && (
              <div className="absolute left-0 top-1/2 z-50 -translate-y-1/2">
                <Button
                  aria-label="Expand chat panel"
                  onClick={handleChatExpand}
                  className="flex h-[100px] w-9 flex-col items-center rounded-l-none rounded-r-lg bg-adam-bg-secondary-dark px-1.5 py-2 text-adam-text-primary"
                >
                  <ChevronsRight className="h-5 w-5 text-white" />
                  <div className="flex flex-1 items-center justify-center">
                    <span className="rotate-90 transform text-center text-base font-semibold text-white">
                      Chat
                    </span>
                  </div>
                </Button>
              </div>
            )}
          </PanelResizeHandle>
          <Panel
            defaultSize={PANEL_SIZES.PREVIEW.DEFAULT}
            minSize={PANEL_SIZES.PREVIEW.MIN}
            id="preview-panel"
            order={1}
          >
            <ParametricPreviewSection
              isLoading={isLoading}
              onOutputChange={setCurrentOutput}
              color={color}
              fixError={!limitReached ? fixError : undefined}
              message={currentMessage}
            />
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}

// @author Kiritohuxing
