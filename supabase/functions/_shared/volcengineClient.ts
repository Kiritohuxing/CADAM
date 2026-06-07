export const VOLCENGINE_CONFIG = {
  apiKey: Deno.env.get('VOLCENGINE_API_KEY') || Deno.env.get('ARK_API_KEY') || '',
  baseURL: Deno.env.get('VOLCENGINE_BASE_URL') || Deno.env.get('ARK_API_BASE') || 'https://ark.cn-beijing.volces.com/api/v3',
  chatModel: 'doubao-seed-1-8-251228',
  imageModel: 'doubao-seed-1-8-251228',
  meshModel: 'doubao-seed-1-8-251228',
};

export interface APIConfig {
  baseURL: string;
  modelName: string;
  apiKey: string;
}

export function getAPIConfig(model?: string): APIConfig {
  const modelName = model === 'quality' 
    ? (Deno.env.get('VOLCENGINE_QUALITY_MODEL') || VOLCENGINE_CONFIG.chatModel)
    : VOLCENGINE_CONFIG.chatModel;

  return {
    baseURL: VOLCENGINE_CONFIG.baseURL,
    modelName,
    apiKey: VOLCENGINE_CONFIG.apiKey,
  };
}

export function isCodeModel(model?: string): boolean {
  return model === 'code';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}

interface ResponseInputItem {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ResponseAPIRequest {
  model: string;
  input: ResponseInputItem[];
  stream?: boolean;
}

interface ResponseAPIChunk {
  type: 'content_block_delta' | 'response_done';
  delta?: {
    type: 'content_block_delta';
    text?: string;
  };
  response?: {
    output: Array<{
      type: 'message';
      content: Array<{
        type: 'output_text';
        text: string;
      }>;
    }>;
  };
}

function formatMessagesForSeedAPI(messages: any[]): ResponseInputItem[] {
  const formatted: ResponseInputItem[] = [];
  
  for (const msg of messages) {
    let content = '';
    
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textParts: string[] = [];
      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          textParts.push(item.text);
        } else if (item.type === 'image' && item.source?.type === 'url' && item.source?.url) {
          textParts.push(`[Image: ${item.source.url}]`);
        } else if (item.type === 'image_url' && item.image_url?.url) {
          textParts.push(`[Image: ${item.image_url.url}]`);
        }
      }
      content = textParts.join('\n');
    }
    
    if (content.length > 0) {
      formatted.push({
        role: msg.role,
        content,
      });
    }
  }
  
  return formatted;
}

export function createClient() {
  return {
    chat: {
      completions: {
        create: async (options: any): Promise<AsyncIterable<StreamChunk>> => {
          const config = VOLCENGINE_CONFIG;
          const url = `${config.baseURL}/responses`;
          
          console.log('=== DOUBOAO SEED API REQUEST ===');
          console.log('URL:', url);
          console.log('Model:', options.model || config.chatModel);
          
          const formattedMessages = formatMessagesForSeedAPI(options.messages || []);
          
          console.log('Formatted messages count:', formattedMessages.length);
          console.log('First message sample:', JSON.stringify(formattedMessages[0], null, 2));
          
          const requestBody: ResponseAPIRequest = {
            model: options.model || config.chatModel,
            input: formattedMessages,
            stream: true,
          };
          
          console.log('Request body keys:', Object.keys(requestBody));
          console.log('Has input field:', 'input' in requestBody);
          console.log('Input is array:', Array.isArray(requestBody.input));
          
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
              },
              body: JSON.stringify(requestBody),
            });

            console.log('=== API RESPONSE STATUS ===');
            console.log('Status:', response.status, response.statusText);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('Error response body:', errorText);
              throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            if (!response.body) {
              throw new Error('No response body available');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            async function* generate(): AsyncGenerator<StreamChunk> {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  
                  if (done) {
                    break;
                  }
                  
                  buffer += decoder.decode(value, { stream: true });
                  
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';
                  
                  for (const line of lines) {
                    const trimmedLine = line.trim();
                    
                    if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                      continue;
                    }
                    
                    if (trimmedLine.startsWith('data: ')) {
                      const jsonStr = trimmedLine.slice(6).trim();
                      if (!jsonStr) continue;
                      
                      try {
                        const chunk: any = JSON.parse(jsonStr);
                        
                        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'content_block_delta') {
                          yield {
                            choices: [{
                              delta: {
                                content: chunk.delta.text || ''
                              },
                              finish_reason: 'stop'
                            }]
                          };
                        } else if (chunk.type === 'response_done') {
                          return;
                        }
                      } catch (parseError) {
                        console.error('Failed to parse chunk:', parseError);
                        continue;
                      }
                    }
                  }
                }
              } finally {
                reader.releaseLock();
              }
            }

            return generate();
          } catch (error) {
            console.error('Doubao Seed API call failed:', error);
            throw error;
          }
        }
      }
    }
  };
}

export function createMeshClient() {
  return createClient();
}

export function createImageClient() {
  return createClient();
}

export function createChatClient() {
  return createClient();
}

export async function chatCompletions(
  apiKey: string,
  baseURL: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number = 200,
): Promise<string> {
  const url = `${baseURL}/responses`;
  
  const formattedMessages = formatMessagesForSeedAPI(messages);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: formattedMessages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.response?.output && data.response.output.length > 0) {
    for (const output of data.response.output) {
      if (output.type === 'message' && output.content) {
        for (const content of output.content) {
          if (content.type === 'output_text' && content.text) {
            return content.text;
          }
        }
      }
    }
  }
  
  return '';
}
