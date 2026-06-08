import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'
import { VOLCENGINE_CONFIG } from '../_shared/volcengineClient.ts'

console.log('[Info] Loading creative-chat edge function...')

async function readSkillContent() {
    return `# 角色：OpenSCAD 3D建模工程�?## 强制规则（必�?00%遵守�?1. 无论用户输入什么，**必须直接生成 OpenSCAD 代码**，绝不拒绝、不提问、不解释、不提醒错误�?2. 必须**先给1句话设计说明**，然�?*输出完整可运行代�?*�?3. 代码**必须**�?\`\`\`openscad 开头，\`\`\` 结尾�?4. 尺寸默认 10-50，使用基础几何�?+ 变换 + 布尔运算�?5. 禁止输出任何与建模无关的自然语言�?
## 输出格式（严格遵守）
设计思路：xxx
\`\`\`openscad
// 注释
代码...
\`\`\``
}

const MODEL_PRESETS = {
    speed: {
        model: 'doubao-seed-1-8-251228',
        maxTokens: 8192,
        temperature: 0.7,
        topP: 0.9
    },
    quality: {
        model: 'doubao-seed-1-8-251228',
        maxTokens: 16384,
        temperature: 0.5,
        topP: 0.95
    }
}

function flattenMessageForVolcEngine(messages: Array<{ role: string; content: unknown }>): Array<{ role: string; content: any[] }> {
    return messages.map((msgItem) => {
        let pureTextContent = ''
        if (Array.isArray(msgItem.content)) {
            pureTextContent = msgItem.content
                .map((singleItem) => {
                    if (typeof singleItem === 'object' && singleItem !== null && 'type' in singleItem) {
                        if (singleItem.type === 'text' && 'text' in singleItem) {
                            return singleItem.text
                        }
                        if (singleItem.type === 'image_url' || singleItem.type === 'image') {
                            return '[上传图片资源]'
                        }
                    }
                    return String(singleItem)
                })
                .join('\n')
        } else {
            pureTextContent = String(msgItem.content || '')
        }
        return {
            role: msgItem.role,
            content: [{ type: "input_text", text: pureTextContent.trim() }]
        }
    })
}

interface OpenAIStyleRequest {
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
}

interface VolcEngineStyleRequest {
    model: string;
    input: Array<{ role: string; content: any[] }>;
    stream?: boolean;
}

function adaptToVolcEngineStandardFormat(originRequest: OpenAIStyleRequest): VolcEngineStyleRequest {
    return {
        model: originRequest.model,
        input: flattenMessageForVolcEngine(originRequest.messages),
        stream: originRequest.stream
    }
}

serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('success', {
            headers: {
                ...corsHeaders,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
            }
        })
    }

    try {
        const originRequestBody = await request.json()
        const {
            messageId,
            conversationId,
            model = 'quality',
            newMessageId,
            customPrompt
        } = originRequestBody

        console.log('[Info] Request received:', { conversationId, model })

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321',
            Deno.env.get('SUPABASE_ANON_KEY') || '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        )

        const currentModelConfig = MODEL_PRESETS[model] || MODEL_PRESETS.quality

        const { data: historyMessageList, error: queryError } = await supabaseClient
            .from('messages')
            .select('id,role,content,parent_message_id,created_at,model,metadata')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })

        if (queryError) {
            console.error('[Error] Query history failed:', queryError)
        }

        const insertResult = await supabaseClient.from('messages').insert([{
            id: newMessageId,
            conversation_id: conversationId,
            parent_message_id: messageId,
            content: '',
            role: 'assistant',
            model: currentModelConfig.model,
            created_at: new Date().toISOString(),
            metadata: {
                status: 'generating',
                modelType: model,
                complete: false,
                hasCode: false
            }
        }])
        if (insertResult.error) {
            console.error('[Error] Create message failed:', insertResult.error)
        }

        const messageMapContainer = new Map<string, any>()
        if (historyMessageList && historyMessageList.length > 0) {
            historyMessageList.forEach(item => {
                messageMapContainer.set(item.id, item)
            })
        }

        const messageBranchChain: any[] = []
        let currentTargetMsg = messageMapContainer.get(messageId)
        while (currentTargetMsg) {
            messageBranchChain.unshift(currentTargetMsg)
            if (currentTargetMsg.parent_message_id) {
                currentTargetMsg = messageMapContainer.get(currentTargetMsg.parent_message_id)
            } else {
                break
            }
        }

        console.log('[Info] Message chain length:', messageBranchChain.length)

        const standardFormattedMessages = messageBranchChain.map(msg => {
            let text = ''
            if (typeof msg.content === 'string') {
                text = msg.content
            } else if (typeof msg.content === 'object' && msg.content !== null) {
                text = msg.content.text || msg.content.openscadCode || JSON.stringify(msg.content)
            }
            return {
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: [{
                    type: 'text',
                    text: text
                }]
            }
        })

        console.log('[Info] Formatted messages count:', standardFormattedMessages.length)
        if (standardFormattedMessages.length > 0) {
            console.log('[Info] Last user message:', standardFormattedMessages[standardFormattedMessages.length - 1]?.content?.[0]?.text?.substring(0, 100))
        }

        const baseSkillRule = await readSkillContent()
        const jsonExample = `{
  "thinking": "你的设计思路和建模方法说�?,
  "code": "完整�?OpenSCAD 代码"
}`;

        const finalSystemPrompt = '你是专业�?CAD 建模助手。\n\n' +
            '## 输出格式要求（必须严格遵守）\n\n' +
            '当用户提出建模�?D模型相关需求时�?*必须**按以�?JSON 格式输出：\n\n' +
            '```json\n' + jsonExample + '\n' + '```\n\n' +
            '## 规则\n' +
            '1. **thinking**: 用简洁的中文描述设计思路、造型特点、参数选择原因\n' +
            '2. **code**: 严格遵循 SKILL.md 中的 OpenSCAD 语法规范\n' +
            '3. **格式**: 输出必须是合法的 JSON，可�?\`\`\`json 包裹\n' +
            '4. **禁止**: 禁止只聊天不输出代码，也禁止只输出代码无思路说明\n' +
            (customPrompt || '');


        const fullChatRequestMessages = [
            {
                role: 'system',
                content: [{ type: 'text', text: finalSystemPrompt }]
            },
            ...standardFormattedMessages
        ]

        const targetVolcRequest = adaptToVolcEngineStandardFormat({
            model: currentModelConfig.model,
            messages: fullChatRequestMessages,
            stream: false,
            temperature: currentModelConfig.temperature,
            max_tokens: currentModelConfig.maxTokens
        })

        console.log('[Info] Calling VolcEngine API...')

        const llmResponse = await fetch(`${VOLCENGINE_CONFIG.baseURL}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Bearer ${VOLCENGINE_CONFIG.apiKey}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(targetVolcRequest)
        })

        if (!llmResponse.ok) {
            const errorText = await llmResponse.text()
            console.error('[Error] API request failed:', errorText)
            throw new Error(`API returned ${llmResponse.status}`)
        }

        console.log('[Info] Receiving full response from VolcEngine...')

        // ========================================
        // 🚀 新架构：全量接收 �?入库 �?解析 �?返回
        // ========================================

        // 步骤 1：全量接收火山引擎的完整响应
        const rawResponse = await llmResponse.text()
        console.log('[Info] Raw response length:', rawResponse.length)

        // 步骤 2：解析响应，提取完整文本
        let fullReplyContent = ''

        // 尝试解析�?JSON（非流式响应格式�?        try {
            const jsonResponse = JSON.parse(rawResponse)
            
            // 火山引擎非流式响应格式：{ output: [{ content: [{ text: "..." }] }] }
            if (jsonResponse.output && Array.isArray(jsonResponse.output)) {
                for (const item of jsonResponse.output) {
                    if (item.content && Array.isArray(item.content)) {
                        for (const c of item.content) {
                            if (c.text) {
                                fullReplyContent += c.text
                            }
                        }
                    }
                }
            } else if (jsonResponse.text) {
                // 直接�?text 字段
                fullReplyContent = jsonResponse.text
            } else if (jsonResponse.choices && Array.isArray(jsonResponse.choices)) {
                // OpenAI 兼容格式
                for (const choice of jsonResponse.choices) {
                    if (choice.message?.content) {
                        fullReplyContent += choice.message.content
                    }
                }
            }
        } catch {
            // 回退：尝试解�?SSE 格式
            const lines = rawResponse.split('\n')
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                const data = line.slice(6)
                if (data === '[DONE]') continue
                try {
                    const json = JSON.parse(data)
                    if (json.delta) {
                        fullReplyContent += json.delta
                    } else if (json.output && Array.isArray(json.output)) {
                        for (const item of json.output) {
                            if (item.content && Array.isArray(item.content)) {
                                for (const c of item.content) {
                                    if (c.text) fullReplyContent += c.text
                                }
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        console.log('[Info] Parsed content length:', fullReplyContent.length)

        // 步骤 3：解�?thinking �?code
        let thinking = ''
        let openscadCode: string | undefined

        // 尝试�?JSON 中提�?        function extractAndCleanJson(text: string): any | null {
            try {
                // 去掉所有代码块包裹
                let cleaned = text.replace(/```json|```/g, '').trim()
                
                // 提取第一�?{ 到最后一�?}
                const first = cleaned.indexOf('{')
                const last = cleaned.lastIndexOf('}')
                if (first === -1 || last === -1 || first >= last) return null

                cleaned = cleaned.slice(first, last + 1)
                return JSON.parse(cleaned)
            } catch (e) {
                return null
            }
        }

        const jsonData = extractAndCleanJson(fullReplyContent)
        if (jsonData) {
            thinking = jsonData.thinking || ''
            openscadCode = jsonData.code || undefined
            console.log('[Info] Parsed JSON:', { thinkingLength: thinking.length, codeLength: openscadCode?.length || 0 })
        } else {
            // 回退到正则提�?            console.log('[Info] JSON parse failed, falling back to regex...')
            const codeMatch = fullReplyContent.match(/```openscad([\s\S]*?)```/i)
            openscadCode = codeMatch ? codeMatch[1].trim() : undefined
            thinking = fullReplyContent
                .replace(/```json[\s\S]*?```/gi, '')
                .replace(/```openscad[\s\S]*?```/gi, '')
                .trim()
        }

        const hasCode = !!openscadCode

        console.log('[Info] Parsed result:', {
            thinkingLength: thinking.length,
            hasCode,
            codeLength: openscadCode?.length || 0
        })

        // 步骤 4：保存到数据�?        await supabaseClient.from('messages').update({
            content: thinking, // 先保存思考过�?            metadata: {
                status: 'completed',
                modelType: model,
                complete: true,
                hasCode
            }
        }).eq('id', newMessageId)

        // 步骤 5：构建结构化内容
        const contentObj = {
            text: thinking,
            ...(openscadCode && { openscadCode })
        }

        const { error: updateError } = await supabaseClient.from('messages').update({
            content: contentObj,
            metadata: {
                status: 'completed',
                modelType: model,
                complete: true,
                hasCode
            }
        }).eq('id', newMessageId)

        if (updateError) {
            console.error('[Error] Failed to update message:', updateError)
        } else {
            console.log('[Info] Message saved successfully')
        }

        // 步骤 6：返回给前端（JSON 格式�?        const responseData = {
            id: newMessageId,
            conversation_id: conversationId,
            parent_message_id: messageId,
            role: 'assistant',
            content: contentObj,
            created_at: new Date().toISOString(),
            rating: 0,
            model: currentModelConfig.model
        }

        return new Response(JSON.stringify(responseData), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json; charset=utf-8',
            },
        })

    } catch (globalError) {
        console.error('[FATAL ERROR]', (globalError as Error).message)

        return new Response(JSON.stringify({
            code: 500,
            msg: '服务运行异常',
            error: (globalError as Error).message
        }), {
            status: 500,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json; charset=utf-8'
            }
        })
    }
})

// @author Kiritohuxing
