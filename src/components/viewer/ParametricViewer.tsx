import { useEffect, useRef, useState, useCallback } from 'react';
import { Message } from '@shared/types';
import { OpenSCADPreview } from './OpenSCADViewer';
import { useOpenSCAD } from '@/hooks/useOpenSCAD';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

interface ParametricViewerProps {
  code: string | undefined | null;
  name: string;
  parameters?: Record<string, any>;
  message: Message;
  compact?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function ParametricViewer({
  code,
  name,
  parameters = {},
  message,
  compact = false,
  size = 'medium',
}: ParametricViewerProps) {
  console.log('[ParametricViewer] Rendering:', {
    name,
    hasCode: !!code,
    codeLength: code?.length || 0,
    codePreview: code?.slice(0, 100) || 'null'
  });

  const { exportScad, isCompiling } = useOpenSCAD('parametric');
  const [isDownloading, setIsDownloading] = useState(false);

  const sizeClasses = {
    small: 'w-24 h-24',
    medium: 'w-full h-48',
    large: 'w-full h-96',
  };

  const handleDownload = useCallback(async () => {
    if (!code || isDownloading) return;
    
    setIsDownloading(true);
    try {
      const stlBlob = await exportScad(code, 'stl');
      const url = URL.createObjectURL(stlBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'component'}.stl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[ParametricViewer] Failed to download STL:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [code, name, exportScad, isDownloading]);

  return (
    <div className="space-y-2">
      <div className={`${compact ? '' : sizeClasses[size]} relative bg-adam-bg-secondary-dark rounded-lg border border-adam-neutral-700 overflow-hidden`}>
        {code ? (
          <OpenSCADPreview
            scadCode={code}
            color="#4a90e2"
            mode="parametric"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-sm text-adam-neutral-400">无代�?/div>
          </div>
        )}
        
        {code && (
          <div className="absolute top-2 right-2">
            <Button
              onClick={handleDownload}
              disabled={isDownloading || isCompiling}
              className="h-7 w-7 p-0 bg-adam-bg-secondary-dark/80 hover:bg-adam-blue text-white rounded-lg border border-adam-neutral-600"
              title="下载 STL"
            >
              {isDownloading || isCompiling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
      
      {!compact && (
        <>
          <div className="text-xs font-medium text-adam-text-primary">{name}</div>
          {Object.keys(parameters).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(parameters).slice(0, 3).map(([key, value]) => (
                <div key={key} className="text-xs px-2 py-1 bg-adam-bg-secondary-dark rounded border border-adam-neutral-700">
                  <span className="text-adam-neutral-400">{key}:</span>
                  <span className="text-adam-text-primary ml-1">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// @author Kiritohuxing
