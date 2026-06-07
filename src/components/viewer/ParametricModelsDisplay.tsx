import { useMemo, useState } from 'react';
import { Message } from '@shared/types';
import { ObjectButton } from '@/components/chat/AssistantMessage';
import { useCurrentMessage } from '@/contexts/CurrentMessageContext';
import { ParametricViewer } from './ParametricViewer';

interface ParametricModelsDisplayProps {
  message: Message;
  currentVersion: number;
}

export function ParametricModelsDisplay({
  message,
  currentVersion,
}: ParametricModelsDisplayProps) {
  const { currentMessage, setCurrentMessage } = useCurrentMessage();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  // ##############################
  // 完全按后端返回结构提取组件
  // 数据结构：content.artifact.components[]
  // 每个组件：{ id, name, openscad, code, parameters, description }
  // ##############################
  const components = useMemo(() => {
    const content = (message as any)?.content;
    if (!content) {
      console.log('[ParametricModelsDisplay] 没有找到 content');
      return [];
    }

    if (!content.artifact) {
      console.log('[ParametricModelsDisplay] 没有找到 artifact');
      return [];
    }

    if (!content.artifact.components || !Array.isArray(content.artifact.components)) {
      console.log('[ParametricModelsDisplay] 没有找到 components 数组');
      return [];
    }

    console.log('[ParametricModelsDisplay] 找到组件:', content.artifact.components.length, '个');
    content.artifact.components.forEach((comp: any, index: number) => {
      console.log(`[ParametricModelsDisplay] 组件 ${index}:`, {
        id: comp.id,
        name: comp.name,
        hasOpenscad: !!comp.openscad,
        openscadLength: comp.openscad?.length || 0,
        hasCode: !!comp.code,
        codeLength: comp.code?.length || 0
      });
    });

    return content.artifact.components;
  }, [message]);

  if (components.length === 0) {
    return <div className="text-center text-adam-neutral-400 py-4">暂无组件</div>;
  }

  // ##############################
  // 安全清洗：修复代码格式，确保 OpenSCAD 能正确解析
  // 优先取 openscad 字段，其次取 code 字段
  // 修复格式问题：{后加换行、}前加换行、;后加换行
  // 保留英文注释（// 开头的行）
  // 移除中文和中文标点
  // ##############################
  const cleanScadCode = (comp: any): string => {
    // 优先取 openscad 字段，其次取 code 字段
    let rawCode = comp.openscad || comp.code || '';
    
    if (!rawCode) {
      console.log(`[ParametricModelsDisplay] 组件 ${comp.id || comp.name} 没有代码`);
      return '';
    }

    console.log(`[ParametricModelsDisplay] 原始代码长度: ${rawCode.length}, 组件: ${comp.name}`);
    console.log(`[ParametricModelsDisplay] 代码预览:\n`, rawCode.slice(0, 200), '...');

    let cleaned = rawCode
      .replace(/[\u4e00-\u9fa5]/g, '')         // 移除中文（保留英文注释）
      .replace(/[。，、；：？！（）【】]/g, '')  // 移除中文标点
      .trim();
    
    // 修复格式问题：在 { 后面添加换行
    cleaned = cleaned.replace(/\{/g, '{\n');
    
    // 修复格式问题：在 } 前面添加换行（如果后面不是换行或文件结尾）
    cleaned = cleaned.replace(/([^\n])\}/g, '$1\n}');
    
    // 修复格式问题：在 ; 后面添加换行（如果后面还有内容且不是换行）
    cleaned = cleaned.replace(/;([^\n])/g, ';\n$1');
    
    // 确保每个语句后有换行（包括注释行）
    cleaned = cleaned.replace(/;\s*$/gm, ';\n');
    
    // 移除多余的连续换行（最多保留两个）
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // 确保文件末尾有换行
    if (!cleaned.endsWith('\n')) {
      cleaned += '\n';
    }

    console.log(`[ParametricModelsDisplay] 清洗后代码长度: ${cleaned.length}`);

    return cleaned;
  };

  // 只有一个或没有组件时，显示 ObjectButton
  if (components.length <= 1) {
    return (
      <ObjectButton
        message={message}
        currentMessage={currentMessage}
        setCurrentMessage={setCurrentMessage}
        currentVersion={currentVersion}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-adam-text-primary">
            {components.length} 个组件
          </span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-adam-blue text-white' : 'text-adam-neutral-400'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-adam-blue text-white' : 'text-adam-neutral-400'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* 网格视图 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 gap-3">
          {components.map((comp: any, index: number) => {
            const scadCode = cleanScadCode(comp);
            if (!scadCode) return null; // 没有代码不渲染
            return (
              <ParametricViewer
                key={comp.id || index}
                code={scadCode}
                name={comp.name || `组件 ${index + 1}`}
                parameters={comp.parameters || {}}
                message={message}
                compact={true}
              />
            );
          })}
        </div>
      )}

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {components.map((comp: any, index: number) => {
            const scadCode = cleanScadCode(comp);
            if (!scadCode) return null; // 没有代码不渲染
            return (
              <div key={comp.id || index} className="flex items-center gap-3 p-3 bg-adam-bg-secondary-dark rounded-lg border border-adam-neutral-700">
                <div className="flex-shrink-0">
                  <ParametricViewer
                    code={scadCode}
                    name={comp.name || `组件 ${index + 1}`}
                    parameters={comp.parameters || {}}
                    message={message}
                    compact={true}
                    size="small"
                  />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-adam-text-primary">{comp.name}</div>
                  <div className="text-xs text-gray-400">代码长度: {scadCode.length}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button
          onClick={() => setCurrentMessage(message)}
          className="px-4 py-2 bg-adam-blue text-white rounded-lg hover:bg-adam-blue/90 text-sm"
        >
          在编辑器中打开全部组件
        </button>
      </div>
    </div>
  );
}