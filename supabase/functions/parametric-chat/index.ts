import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'
import { VOLCENGINE_CONFIG } from '../_shared/volcengineClient.ts'

console.log('[Info] Loading parametric-chat edge function...')

const INSTRUCTIONS_PARAMETRIC = `你是专业3D参数化建模助手，根据用户描述的模型、零部件、尺寸参数完成设计。

回复固定分为两部分，严格遵守：
1. 通俗设计简述：纯文字，讲解结构组成、部件作用
2. 全文最后，只输出一段干净的 JSON 数组，无任何多余字符

JSON 格式范例：
[{"id":"part_id","name":"部件名","description":"说明","code":"openscad代码"}]

强制规则（ZeroToCAD 标准）：
1. JSON 数组必须放在回复最后，单独一行
2. 每个组件 code 是完整可编译的 OpenSCAD 代码
3. 代码无注释，可独立运行
4. 整体尺寸 10-60mm，适合3D打印
5. 部件用 translate 正确装配，不重叠
6. JSON 必须 100% 合法，无格式错误
7. 不输出任何多余符号、不输出嵌套对象`

function parseModelComponents(text: string): any[] {
    const reg = /\[\{[\s\S]*\}\]$/;
    const match = text.match(reg);
    if (!match) return [];
    try {
        return JSON.parse(match[0]);
    } catch {
        return [];
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

function parseSSE(raw: string): string {
    const lines = raw.split('\n')
    let text = ''
    for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
            const json = JSON.parse(data)
            if (json.delta) {
                text += json.delta
            } else if (json.output && Array.isArray(json.output)) {
                for (const item of json.output) {
                    if (item.content && Array.isArray(item.content)) {
                        for (const c of item.content) {
                            if (c.text) text += c.text
                        }
                    }
                }
            }
        } catch (e) {}
    }
    return text
}

function normalizeOpenSCADCode(code: string): string {
    if (!code) return ''
    
    return code
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t/g, '  ')
        .replace(/\u0000/g, '')
        .replace(/\u2028/g, '\n')
        .replace(/\u2029/g, '\n')
        .replace(/\\(?!["\\/bfnrt])/g, '\\\\')
        .replace(/\\/g, '\\\\')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s+/gm, '')
        .replace(/\s+$/gm, '')
        .replace(/\s+([{}();,])/g, '$1')
        .replace(/([{}();,])\s+/g, '$1')
        .trim()
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
            model: 'doubao-seed-1-8-251228',
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

        const finalSystemPrompt = `${INSTRUCTIONS_PARAMETRIC}

${customPrompt || ''}`

        const fullChatRequestMessages = [
            {
                role: 'system',
                content: [{ type: 'text', text: finalSystemPrompt }]
            },
            ...standardFormattedMessages
        ]

        const targetVolcRequest = {
            model: 'doubao-seed-1-8-251228',
            input: flattenMessageForVolcEngine(fullChatRequestMessages),
            stream: true
        }

        console.log('[Info] Calling VolcEngine API...')

        const VOLCENGINE_CONFIG = {
            apiKey: Deno.env.get('VOLCENGINE_API_KEY') || Deno.env.get('ARK_API_KEY') || '',
            baseURL: Deno.env.get('VOLCENGINE_BASE_URL') || Deno.env.get('ARK_API_BASE') || 'https://ark.cn-beijing.volces.com/api/v3',
            model: 'doubao-seed-1-8-251228'
        }

        const llmResponse = await fetch(`${VOLCENGINE_CONFIG.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Bearer ${VOLCENGINE_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: VOLCENGINE_CONFIG.model,
                messages: fullChatRequestMessages,
                stream: false,
                max_tokens: 2048,
                temperature: 0.1
            })
        })

        if (!llmResponse.ok) {
            const errorText = await llmResponse.text()
            console.error('[Error] VolcEngine API error:', errorText)
            throw new Error(`API error: ${llmResponse.status}`)
        }

        const llmData = await llmResponse.json()
        const rawResponse = llmData.choices?.[0]?.message?.content || ''
        
        console.log('[Info] Raw response length:', rawResponse.length)
        const fullText = rawResponse
        console.log('[Info] Parsed content length:', fullText.length)

        // ====================== 修复区域 START ======================
        let fullJson: any = null
        let parsedComponents: any[] = []
        let hasCode = false
        let resultText = fullText.trim()

        console.log('[Info] Trying to parse model components from response...')
        parsedComponents = parseModelComponents(fullText)
        
        if (parsedComponents.length > 0) {
            console.log('[Info] Found JSON array at end of response')
            hasCode = true
            
            parsedComponents = parsedComponents.map((component: any, index: number) => {
                const code = normalizeOpenSCADCode(component.code || '')
                return {
                    id: component.id || `component_${index + 1}`,
                    name: component.name || `Component ${index + 1}`,
                    description: component.description || '',
                    code: code,
                    openscad: code,
                    parameters: component.parameters ?? {}
                }
            })
            
            const jsonMatch = fullText.match(/\[\{[\s\S]*\}\]$/);
            if (jsonMatch) {
                resultText = fullText.slice(0, fullText.length - jsonMatch[0].length).trim();
            }
        } else {
            console.log('[Info] No JSON array found, trying legacy JSON format...')
            try {
                fullJson = JSON.parse(fullText)
            } catch (e) {
                console.warn("[Warning] JSON parse failed")
            }

            if (fullJson?.artifact && Array.isArray(fullJson.artifact.components)) {
                parsedComponents = fullJson.artifact.components.map((component: any, index: number) => {
                    const code = normalizeOpenSCADCode(component.code || '')
                    if (code.trim()) hasCode = true
                    return {
                        id: component.id || `component_${index + 1}`,
                        name: component.name || `Component ${index + 1}`,
                        description: component.description || '',
                        code: code,
                        openscad: code,
                        parameters: component.parameters ?? {}
                    }
                })
                hasCode = true
                resultText = fullJson.text ?? ''
            }
        }

        console.log('[Info] Parsed parametric result:', {
            hasCode,
            componentCount: parsedComponents.length,
            firstComponent: parsedComponents[0]?.name
        })
        // ====================== 修复区域 END ======================

        const rawContentObj = {
            text: resultText,
            rawJson: JSON.stringify(fullJson)
        }

        const contentObj: any = {
            text: resultText
        }

        if (hasCode && parsedComponents.length > 0) {
            const allParameters = parsedComponents.flatMap((component: any) => {
                return Object.entries(component.parameters || {}).map(([name, desc]) => ({
                    name,
                    type: "number",
                    value: 10,
                    componentId: component.id,
                    description: desc || `Parameter for ${component.name}`,
                    displayName: name,
                    defaultValue: 10,
                    componentName: component.name
                }));
            });

            const finalParameters = parsedComponents.length > 0
                ? allParameters.length > 0
                    ? allParameters
                    : [
                        {
                            name: "placeholder",
                            type: "number",
                            value: 0,
                            componentId: "none",
                            description: "No parameters",
                            displayName: "Placeholder",
                            defaultValue: 0,
                            componentName: "System"
                        }
                      ]
                : [];

            contentObj.artifact = {
                title: `Parametric Model (${parsedComponents.length} components)`,
                version: '1.0',
                components: parsedComponents,
                code: parsedComponents.map(c => `// ${c.name}\n${c.code}`).join('\n\n'),
                parameters: finalParameters
            }
        }

        console.log('[Info] Saving raw response to database...')
        await supabaseClient.from('messages').update({
            content: rawContentObj,
            metadata: {
                status: 'saving',
                modelType: model,
                complete: false,
                hasCode: false
            }
        }).eq('id', newMessageId)

        console.log('[Info] Saving parsed response to database...')
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

        const responseData = {
            id: newMessageId,
            conversation_id: conversationId,
            parent_message_id: messageId,
            role: 'assistant',
            content: contentObj,
            created_at: new Date().toISOString(),
            rating: 0,
            model: 'doubao-seed-1-8-251228',
            metadata: {
                status: 'completed',
                modelType: model,
                complete: true,
                hasCode
            }
        }

        console.log('[Info] Response prepared successfully')
        console.log('[Info] Final result:', { hasCode, components: parsedComponents.length })

        const sseResponse = `data: ${JSON.stringify(responseData)}\n\ndata: [DONE]\n\n`
        
        return new Response(sseResponse, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })

    } catch (globalError) {
        console.error('[FATAL ERROR]', (globalError as Error).message)

        const errorResponse = {
            code: 500,
            msg: '服务运行异常',
            error: (globalError as Error).message
        }
        
        const errorSseResponse = `data: ${JSON.stringify(errorResponse)}\n\ndata: [DONE]\n\n`
        
        return new Response(errorSseResponse, {
            status: 500,
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream; charset=utf-8',
            }
        })
    }
})