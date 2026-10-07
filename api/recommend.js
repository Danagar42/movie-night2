import { generateText } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';
import fs from 'fs';
import path from 'path';

const MODELS_TO_TRY = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash'
];

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

function checkRateLimit(ip) {
  const now = Date.now();
  if (rateLimitMap.size > 500) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) {
        rateLimitMap.delete(key);
      }
    }
    if (rateLimitMap.size > 1000) {
      rateLimitMap.clear();
    }
  }

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  const entry = rateLimitMap.get(ip);
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + RATE_LIMIT_WINDOW_MS;
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  entry.count++;
  return true;
}

export default async function handler(req, res) {
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

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too Many Requests' });
    return;
  }

  try {
    const body = req.body || {};
    
    let prompt = '';
    let systemPrompt = '';
    let isJson = body.isJson !== false; // default true if not strictly false

    const sanitize = (str, max = 500) => (typeof str === 'string' ? str.slice(0, max) : '');
    
    if (typeof body.prompt === 'string' && body.prompt.trim()) {
      prompt = body.prompt;
      if (typeof body.systemPrompt === 'string') {
        systemPrompt = body.systemPrompt;
      }
      if (typeof body.isJson === 'boolean') {
        isJson = body.isJson;
      }
    } else if (body.type === 'search' || body.mood) {
        const mood = sanitize(body.mood);
        const genre = sanitize(body.genre);
        const minYear = Number(body.minYear) || 1970;
        const maxYear = Number(body.maxYear) || 2026;
        let excludeTitles = Array.isArray(body.excludeTitles) ? body.excludeTitles : [];
        excludeTitles = excludeTitles.map(t => sanitize(t, 100)).slice(0, 50);

        systemPrompt = "Ти - найкращий кінознавець. Відповідай JSON масивом.";
        prompt = `Знайди 15 фільмів. Настрій: ${mood||''}, Жанр: ${genre||''}, Рік: ${minYear}-${maxYear}. JSON масив з об'єктами: {"title_en": "...", "title_ua": "...", "year": "...", "plot": "..."}`;
        if (excludeTitles.length > 0) prompt += ` ПРОПУСТИ: ${excludeTitles.join(', ')}`;
    } else if (body.type === 'motd') {
        const season = sanitize(body.season, 50);
        const dayMood = sanitize(body.dayMood, 100);
        const tasteHint = sanitize(body.tasteHint, 300);
        let excludeTitles = Array.isArray(body.excludeTitles) ? body.excludeTitles : [];
        excludeTitles = excludeTitles.map(t => sanitize(t, 100)).slice(0, 50);

        systemPrompt = "Ти - кіно-куратор. Відповідай JSON.";
        prompt = `Підбери 1 ${season} фільм. Настрій: ${dayMood}. ${tasteHint} Поверни JSON: {"title_en": "...", "title_ua": "...", "year": "...", "why": "..."}`;
        if (excludeTitles.length > 0) prompt += ` ПРОПУСТИ: ${excludeTitles.join(', ')}`;
    } else if (body.type === 'critique') {
        const movieTitle = sanitize(body.movieTitle, 100);
        const tasteCtx = sanitize(body.tasteCtx, 300);
        systemPrompt = "Ти - щирий друг Ані, ділишся враженнями про кіно.";
        prompt = `Ти - кращий друг Ані.${tasteCtx ? ' ' + tasteCtx : ''} Розкажи їй своїми словами про фільм "${movieTitle}" тільки 1-2 речення: чому саме їй це сподобається або на що звернути увагу. Тільки 1 коротке речення.`;
        isJson = false;
    }

    if (!prompt) {
      res.status(400).json({ error: 'Missing valid parameters' });
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
    } else {
      const candidateKeyPaths = [
        path.resolve(process.cwd(), '..', 'gen-lang-client-0579123407-0883ecb8fda7.json'),
        path.resolve(process.cwd(), 'gen-lang-client-0579123407-0883ecb8fda7.json')
      ];
      for (const p of candidateKeyPaths) {
        if (fs.existsSync(p)) {
          authOptions.keyFilename = p;
          break;
        }
      }
    }

    if (Object.keys(authOptions).length === 0) {
      console.warn('[Vertex AI Auth] Warning: No service account credentials configured (GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY) and no candidateKeyPaths found.');
    }

    const location = process.env.GOOGLE_VERTEX_LOCATION || 'global';

    const vertex = createVertex({
      project: process.env.GOOGLE_VERTEX_PROJECT || 'gen-lang-client-0579123407',
      location: location,
      googleAuthOptions: Object.keys(authOptions).length > 0 ? authOptions : undefined,
    });

    let text = null;
    let lastError = null;

    for (const modelName of MODELS_TO_TRY) {
      try {
        const model = vertex(modelName, {
          useSearchGrounding: false,
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }
          ]
        });
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
