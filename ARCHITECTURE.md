# CADAM 智能路由 Text-to-OpenSCAD 架构

## 📋 概述

CADAM 现在实现了智能路由系统，可以根据用户输入自动判断：
1. **普通问答** → AI 直接回答
2. **3D 模型生成** → AI 读取 SKILL.md → 生成 OpenSCAD 代码 → 浏览器编译 → 3D 渲染

## 🔄 完整流程

```
用户输入: "a smooth 3D ball"
    ↓
┌─────────────────────────────────────┐
│  1. 火山引擎 AI 判断意图             │
│     - 普通问答 → 直接回答            │
│     - 3D 模型 → 调用 read_skill     │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  2. AI 调用 read_skill 工具         │
│     - 读取 SKILL.md 内容            │
│     - 获取 OpenSCAD 语法指南        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  3. AI 生成 OpenSCAD 代码           │
│     - 根据 SKILL.md 指导生成代码     │
│     - 调用 generate_openscad_code   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  4. 后端返回代码给前端               │
│     - content.openscadCode          │
│     - 流式传输                      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  5. 前端 OpenSCADPreview 组件        │
│     - 接收 openscadCode             │
│     - 调用 useOpenSCAD Hook         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  6. 浏览器 WebAssembly 编译          │
│     - OpenSCAD WASM 编译器          │
│     - 生成三角网格 (OFF/STL)        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  7. Three.js 渲染                   │
│     - React Three Fiber             │
│     - 实时交互 (旋转/缩放/平移)     │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  8. 生成 Suggestions                │
│     - AI 生成创意建议                │
│     - 用户可继续编辑                 │
└─────────────────────────────────────┘
```

## 📁 修改的文件

### 1. `supabase/functions/creative-chat/index.ts`

#### 新增功能：
- **read_skill 工具** - 让 AI 可以读取 SKILL.md
- **generate_openscad_code 工具** - 让 AI 生成并返回 OpenSCAD 代码
- **readSkillContent() 函数** - 读取 SKILL.md 文件
- **智能路由逻辑** - 根据工具调用决定处理方式

#### 关键代码：

```typescript
// 工具定义
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'read_skill',
      description: 'Reads the OpenSCAD skill guide...',
      parameters: { type: 'object' as const, properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_openscad_code',
      description: 'Generates OpenSCAD code for a 3D model...',
      parameters: {
        type: 'object' as const,
        properties: {
          code: { type: 'string', description: 'Complete OpenSCAD code...' },
          description: { type: 'string', description: 'Brief description...' },
        },
        required: ['code'],
      },
    },
  },
];

// 读取 SKILL.md
async function readSkillContent(): Promise<string> {
  const skillPath = new URL('../../text-to-cad/SKILL.md', import.meta.url);
  return await Deno.readTextFile(skillPath);
}

// 工具调用处理
if (currentToolCall.name === 'read_skill') {
  // 读取 skill 并继续对话
  const skillContent = await readSkillContent();
  // 将 skill 内容发送回 AI，继续生成
}

if (currentToolCall.name === 'generate_openscad_code') {
  // 返回 OpenSCAD 代码
  content.openscadCode = toolInput.code;
  streamMessage(controller, { ...newMessageData, content });
}
```

### 2. `shared/types.ts`

#### 新增字段：
```typescript
export type Content = {
  // ... 现有字段
  openscadCode?: string;  // ✅ 新增：OpenSCAD 代码
};
```

### 3. `src/components/viewer/CreativePreviewSection.tsx`

#### 新增渲染逻辑：
```typescript
// 接收并渲染 OpenSCAD 代码
{message?.content.openscadCode && (
  <div className="h-full w-full">
    <OpenSCADPreview
      scadCode={message.content.openscadCode}
      color="#F8248A"
    />
  </div>
)}
```

### 4. `text-to-cad/SKILL.md`

完整的 OpenSCAD 语法指南和最佳实践。

## 🎯 AI 决策流程

```
用户输入
    ↓
AI 判断：
├─ 如果是 3D 模型请求
│   ├─ 调用 read_skill → 获取 SKILL.md
│   ├─ 调用 generate_openscad_code → 生成代码
│   └─ 返回 { openscadCode: "..." }
│
└─ 如果是普通问答
    └─ 直接返回文本回答
```

## 🔧 SKILL.md 内容

SKILL.md 包含：
1. **OpenSCAD 基础语法** - primitives, transformations, booleans
2. **代码模板** - 标准代码结构
3. **示例代码** - 常见模型示例
4. **最佳实践** - 性能优化、常见错误
5. **WebAssembly 注意事项** - 浏览器编译的特殊考虑

## 🧪 测试方法

### 1. 启动服务
```bash
# 启动 Supabase
cd supabase
supabase start
supabase functions serve --no-verify-jwt

# 启动前端
npm run dev
```

### 2. 测试普通问答
- 输入: "什么是 CAD?"
- 期望: AI 直接回答文本

### 3. 测试 3D 模型生成
- 输入: "a smooth 3D ball"
- 期望:
  1. 控制台显示 "read_skill tool called"
  2. 控制台显示 "generate_openscad_code tool called"
  3. 3D 球体模型渲染
  4. Suggestions 显示

## 📊 数据流

### 请求流
```
前端 (messageService.ts)
    ↓ POST /functions/v1/creative-chat
后端 (creative-chat/index.ts)
    ↓ 调用 火山引擎 API
火山引擎
    ↓ 工具调用: read_skill, generate_openscad_code
后端处理
    ↓ 流式响应
前端更新 (openscadCode)
    ↓
OpenSCADPreview 组件
    ↓
useOpenSCAD Hook (浏览器编译)
    ↓
Three.js 渲染
```

## ⚙️ 环境配置

确保以下环境变量已设置：
```bash
# .env (supabase/functions/)
ENVIRONMENT="local"
DISABLE_BILLING="true"  # 开发环境禁用计费
```

## 🎨 渲染流程

### CreativePreviewSection 组件
```typescript
// 根据内容类型选择渲染方式
{message?.content.images && <ImageGallery />}
{message?.content.mesh && <MeshPreview />}
{message?.content.openscadCode && <OpenSCADPreview />}  // ✅ 新增
```

### OpenSCADPreview 组件
```typescript
// 接收 scadCode，自动编译并渲染
useEffect(() => {
  if (scadCode) {
    compileScad(scadCode);  // 浏览器内 WebAssembly 编译
  }
}, [scadCode]);
```

## 🚀 性能优化

1. **流式响应** - 代码边生成边传输
2. **浏览器编译** - 无需服务器端编译
3. **WASM 优化** - 使用 manifold 后端
4. **按需编译** - 只在代码变化时重新编译

## 🔍 调试技巧

### 查看 AI 决策
在 Supabase Functions 日志中查找：
- `READ_SKILL TOOL CALLED`
- `GENERATE_OPENSCAD_CODE TOOL CALLED`
- `OpenSCAD code generated, length:`

### 查看编译状态
在浏览器控制台中查找：
- `[OpenSCAD] Compiling...`
- `[OpenSCAD] Compiled successfully`
- `[OpenSCAD] Error: ...`

## 📝 注意事项

1. **SKILL.md 位置** - 必须在 `supabase/text-to-cad/SKILL.md`
2. **文件读取权限** - Deno 需要读取本地文件的权限
3. **浏览器兼容性** - 需要现代浏览器支持 WebAssembly
4. **Token 限制** - 确保 API Token 足够生成代码

## 🔄 未来优化方向

1. **缓存 SKILL.md** - 避免重复读取
2. **代码验证** - 在返回前端前验证 OpenSCAD 语法
3. **渐进式渲染** - 代码生成时就显示部分模型
4. **错误恢复** - AI 生成错误代码时的自动修复
