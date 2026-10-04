import { generateText } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';

const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.5-pro'
];

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { prompt, systemPrompt, isJson } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    const authOptions = {};
    if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      authOptions.credentials = {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      authOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }

    const location = process.env.GOOGLE_VERTEX_LOCATION || 'global';

    const vertex = createVertex({
      project: process.env.GOOGLE_VERTEX_PROJECT || 'gen-lang-client-0579123407',
      location: location,
      googleAuthOptions: Object.keys(authOptions).length > 0 ? authOptions : undefined,
    });

    let text = null;
    let lastError = null;

    // Try candidate models in order (newest/smartest gemini-2.5-flash first, then fallback)
    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = vertex(modelName);
        const generateOptions = {
          model,
          prompt,
        };

        if (systemPrompt) {
          generateOptions.system = systemPrompt;
        }

        const result = await generateText(generateOptions);
        text = result.text;
        if (text) {
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Vertex AI] Model ${modelName} in location ${location} failed:`, err.message || err);
      }
    }

    if (!text) {
      throw lastError || new Error('No candidate Vertex AI model responded');
    }
    
    let cleanText = (text || '').trim();
    if (isJson) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    res.status(200).json({ text: cleanText });
  } catch (error) {
    console.error('Error in /api/recommend:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
