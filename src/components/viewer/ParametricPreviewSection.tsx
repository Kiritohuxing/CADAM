import { ImageGallery } from '@/components/viewer/ImageGallery';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import Loader from '@/components/viewer/Loader';
import { OpenSCADPreview } from './OpenSCADViewer';
import OpenSCADError from '@/lib/OpenSCADError';
import { DxfExporter } from '@/utils/downloadUtils';
import { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useConversation } from '@/contexts/ConversationContext';
import { generate3DModelFilename } from '@/utils/file-utils';

interface ParametricPreviewSectionProps {
  isLoading: boolean;
  color: string;
  onOutputChange?: (output: Blob | undefined) => void;
  onDxfExportChange?: (exporter: DxfExporter | null) => void;
  fixError?: (error: OpenSCADError) => void;
  isMobile?: boolean;
  message?: any;
}

export function ParametricPreviewSection({
  isLoading,
  color,
  onOutputChange,
  onDxfExportChange,
  fixError,
  isMobile,
  message: propMessage,
}: ParametricPreviewSectionProps) {
  const { currentMessage: contextMessage } = useCurrentMessage();
  const message = contextMessage ?? propMessage;
  const { conversation } = useConversation();
  const [currentOutput, setCurrentOutput] = useMemo(() => {
    const outputRef: { current: Blob | undefined } = { current: undefined };
    return [
      () => outputRef.current,
      (output: Blob | undefined) => {
        outputRef.current = output;
        onOutputChange?.(output);
      },
    ];
  }, [onOutputChange]);

  const filename = useMemo(() => {
    return generate3DModelFilename({
      conversationTitle: conversation?.title,
      assistantMessage: message || undefined,
      modelName: 'parametric',
      fallback: `3d-model-${message?.id || 'preview'}`,
    });
  }, [conversation?.title, message]);

  const handleDownloadSTL = useCallback(() => {
    const output = currentOutput();
    if (!output) {
      console.log('[ParametricPreview] No output to download');
      return;
    }

    const url = URL.createObjectURL(output);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.stl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentOutput, filename]);

  const scadCode = useMemo(() => {
    if (!message) {
      console.log('[ParametricPreview] No message');
      return null;
    }

    if (message.content?.artifact) {
      const art = message.content.artifact;
      console.log('[ParametricPreview] Found artifact:', { 
        hasComponents: !!art.components,
        componentCount: art.components?.length || 0,
        hasCode: !!art.code 
      });
      
      if (art.code) {
        console.log('[ParametricPreview] Using artifact.code, length:', art.code.length);
        return art.code;
      }
      if (art.components?.length) {
        console.log('[ParametricPreview] Using components:', art.components.map((c: any) => ({
          hasOpenscad: !!c.openscad,
          hasCode: !!c.code,
          openscadLength: c.openscad?.length || 0,
          codeLength: c.code?.length || 0
        })));
        
        const codes = art.components
          .map((c: any) => c.openscad || c.code || '')
          .filter(Boolean);
        console.log('[ParametricPreview] Filtered codes count:', codes.length);
        
        const joinedCode = codes.join('\n');
        console.log('[ParametricPreview] Final code length:', joinedCode.length);
        return joinedCode;
      }
    }

    const fallbackCode = (message as any).openscadCode || message.content?.openscadCode;
    console.log('[ParametricPreview] Using fallback code:', !!fallbackCode, fallbackCode?.length);
    return fallbackCode || null;
  }, [message]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-adam-neutral-700">
      {isLoading ? (
        <div
          className={`flex h-full items-center justify-center ${isMobile ? 'pb-20 pt-0' : ''}`}
        >
          <Loader message="Generating model" />
        </div>
      ) : (
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-2">
          {message?.content.images && Array.isArray(message.content.images) && (
            <ImageGallery imageIds={message.content.images} />
          )}
          {scadCode && (
            <div className="flex h-full w-full flex-col">
              <div className="flex-1">
                <OpenSCADPreview
                  scadCode={scadCode}
                  color={color}
                  onOutputChange={setCurrentOutput}
                  onDxfExportChange={onDxfExportChange}
                  fixError={fixError}
                />
              </div>
              <div className="flex justify-center p-3">
                <Button
                  onClick={handleDownloadSTL}
                  className="flex items-center gap-2 bg-adam-blue hover:bg-adam-blue/90 text-white px-4 py-2 rounded-lg"
                >
                  <Download className="h-4 w-4" />
                  <span>下载 STL</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// @author Kiritohuxing
