import { ImageGallery } from './ImageGallery';
import { OpenSCADPreview } from './OpenSCADViewer';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import { useConversation } from '@/contexts/ConversationContext';
import { CreativeLoadingBar } from './CreativeLoadingBar';
import { CreativeModel } from '@shared/types';
import { useMemo } from 'react';

interface CreativePreviewSectionProps {
  isLoading: boolean;
  message?: any;
}

export function CreativePreviewSection({
  isLoading,
  message: propMessage,
}: CreativePreviewSectionProps) {
  const { currentMessage: contextMessage } = useCurrentMessage();
  const message = propMessage ?? contextMessage;
  const { conversation } = useConversation();

  const scadCode = useMemo(() => {
    if (!message) return null;

    if (message.content?.artifact) {
      const art = message.content.artifact;
      if (art.components?.length) {
        return art.components
          .map((c: any) => c.openscad || c.code || '')
          .filter(Boolean)
          .join('\n');
      }
      if (art.code) return art.code;
    }

    return message.content?.openscadCode || null;
  }, [message]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-adam-neutral-700">
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
          <CreativeLoadingBar
            modelName={
              (message?.content.model ??
                conversation.settings?.model ??
                'quality') as CreativeModel
            }
          />
        </div>
      ) : (
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-2">
          {message?.content.images && Array.isArray(message.content.images) && (
            <ImageGallery imageIds={message.content.images} />
          )}
          {scadCode && (
            <div className="h-full w-full">
              <OpenSCADPreview
                scadCode={scadCode}
                color="#F8248A"
                mode="creative"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// @author Kiritohuxing
