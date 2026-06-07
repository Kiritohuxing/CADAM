import { Buffer } from 'node:buffer';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.9';
import { createImageClient, VOLCENGINE_CONFIG } from './volcengineClient.ts';

const DEBUG_LOGS =
  Deno.env.get('ENVIRONMENT') === 'local' ||
  Deno.env.get('DEBUG_LOGS') === 'true';
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

export const INSTRUCTIONS_3D =
  'You are generating a fully textured and rendered 3D model. Output one centered 3D model or multiple centered objects, no text. Plain white background (or an empty background which provides optimal contrast with the textures of the 3D model), neutral lighting, and a soft shadow directly under the 3D model. Keep the entire object fully in-frame with 5–10% padding; no cropping. Make sure the description strongly impacts the form and shape of the 3D Model not just the surface texture';

export type ImageGenerationResult = {
  imageBytes: Buffer;
  contentType: 'image/png' | 'image/jpeg';
};

export const generateImageWithVolcengine = async (
  supabaseClient: SupabaseClient,
  userId: string,
  conversationId: string,
  prompt: string,
  images: string[],
): Promise<ImageGenerationResult> => {
  debugLog('Generating image with Doubao Seed 1.8', {
    userId,
    conversationId,
    prompt,
    imagesCount: images.length,
    model: VOLCENGINE_CONFIG.imageModel,
  });

  const client = createImageClient();

  const inputContent: Array<{
    type: 'input_text' | 'input_image';
    text?: string;
    image_url?: string;
  }> = [{ type: 'input_text', text: `${INSTRUCTIONS_3D} ${prompt}` }];

  if (images.length > 0) {
    const latestImageId = images[images.length - 1];
    const { data: imageData } = await supabaseClient.storage
      .from('images')
      .download(`${userId}/${conversationId}/${latestImageId}`);

    if (imageData) {
      const imageArrayBuffer = await imageData.arrayBuffer();
      const base64Image = Buffer.from(imageArrayBuffer).toString('base64');
      const mimeType =
        imageData.type && imageData.type.startsWith('image/')
          ? imageData.type
          : 'image/png';

      inputContent.push({
        type: 'input_image',
        image_url: `data:${mimeType};base64,${base64Image}`,
      });
    }
  }

  try {
    const stream = await client.chat.completions.create({
      model: VOLCENGINE_CONFIG.imageModel,
      messages: [
        {
          role: 'user',
          content: inputContent,
        },
      ],
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta?.content) {
        fullResponse += chunk.choices[0].delta.content;
      }
    }

    let imageBase64 = '';
    const jsonMatch = fullResponse.match(/"image_base64"\s*:\s*"([^"]+)"/);
    if (jsonMatch) {
      imageBase64 = jsonMatch[1];
    } else {
      const b64Match = fullResponse.match(/base64[,:]?\s*(["']?)([A-Za-z0-9+/=]+)\1/);
      if (b64Match) {
        imageBase64 = b64Match[2];
      }
    }

    if (!imageBase64) {
      throw new Error('No generated image data from Doubao Seed');
    }

    const imageBytes = Buffer.from(imageBase64, 'base64');
    return {
      imageBytes,
      contentType: 'image/png',
    };
  } catch (error) {
    console.error('Doubao Seed API call failed:', error);
    throw error;
  }
};
