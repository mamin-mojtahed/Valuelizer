import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health & capability status endpoint
  app.get('/api/status', (_req, res) => {
    res.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
  });

  // Batch Embedding Endpoint for Gemini Embedding 2 & Gemini Embedding 001
  app.post('/api/embed', async (req, res) => {
    try {
      const { texts, model = 'gemini-embedding-2-preview' } = req.body as {
        texts: string[];
        model?: string;
      };

      if (!Array.isArray(texts) || texts.length === 0) {
        res.status(400).json({ error: 'texts array is required' });
        return;
      }

      const ai = getGenAIClient();
      // Map user-facing model identifier to valid Gemini API embedding model name
      const resolvedModel =
        model === 'gemini-embedding-2' || model === 'gemini-embedding-2-preview'
          ? 'gemini-embedding-2-preview'
          : 'gemini-embedding-001';

      const result = await ai.models.embedContent({
        model: resolvedModel,
        contents: texts,
      });

      const embeddings = (result.embeddings || []).map((e) => e.values || []);
      res.json({
        model: resolvedModel,
        dimensions: embeddings[0]?.length || 0,
        embeddings,
      });
    } catch (error: any) {
      const message = error?.message || 'Gemini embedding request failed';
      res.status(500).json({ error: message });
    }
  });

  // OpenAI Embedding Endpoint (uses server-side OPENAI_API_KEY if configured)
  app.post('/api/embed-openai', async (req, res) => {
    try {
      const { texts, model = 'text-embedding-3-small' } = req.body as {
        texts: string[];
        model?: string;
      };

      const openAiKey = process.env.OPENAI_API_KEY;
      if (!openAiKey) {
        res.status(400).json({
          error: 'OPENAI_API_KEY is not set in environment secrets.',
        });
        return;
      }

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        res.status(response.status).json({ error: `OpenAI API error: ${errBody}` });
        return;
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      const embeddings = data.data.map((item) => item.embedding);
      res.json({
        model,
        dimensions: embeddings[0]?.length || 1536,
        embeddings,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'OpenAI embedding request failed' });
    }
  });

  // Flash-Lite Hybrid Verifier Endpoint (audits speaker turn boundaries & ambiguous high-conflict polarity scores)
  app.post('/api/verify-polarity', async (req, res) => {
    try {
      const { utterances } = req.body as {
        utterances: Array<{
          id: string;
          speaker: string;
          text: string;
          previousText?: string;
          candidateValues: Array<{ valueId: string; delta: number }>;
        }>;
      };

      if (!Array.isArray(utterances) || utterances.length === 0) {
        res.status(400).json({ error: 'utterances array is required' });
        return;
      }

      const ai = getGenAIClient();
      const prompt = `You are a psychometric auditor specializing in Shalom H. Schwartz's Theory of Basic Human Values (SELF_DIRECTION, STIMULATION, HEDONISM, ACHIEVEMENT, POWER, SECURITY, CONFORMITY, TRADITION, BENEVOLENCE, UNIVERSALISM).
For each speaker utterance below (with its preceding turn context and initial embedding polarity deltas), verify whether the speaker is genuinely endorsing (+) or rejecting/subordinating (-) the top candidate values, and provide a concise 1-sentence psychometric rationale.

Input Utterances:
${JSON.stringify(utterances, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                verifiedValueId: { type: Type.STRING },
                verifiedPolarity: {
                  type: Type.NUMBER,
                  description: 'Calibrated delta multiplier between -0.35 and +0.35',
                },
                rationale: { type: Type.STRING },
              },
              required: ['id', 'verifiedValueId', 'verifiedPolarity', 'rationale'],
            },
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '[]');
      res.json({ verifications: parsed });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Flash-Lite verification failed' });
    }
  });

  // Dynamic YouTube Conversation Ingestion / Search Synthesis via Gemini
  app.post('/api/youtube-ingest', async (req, res) => {
    try {
      const { queryOrUrl, videoId } = req.body as {
        queryOrUrl: string;
        videoId?: string;
      };

      const ai = getGenAIClient();
      const prompt = `Generate a realistic, scientifically rich, diarized 2-speaker transcript for the following YouTube conversation topic or URL: "${queryOrUrl}".
Ensure the two speakers have distinct, well-articulated philosophical or strategic viewpoints that naturally surface multiple Schwartz Basic Human Values (such as Self-Direction, Stimulation, Hedonism, Achievement, Power, Security, Conformity, Tradition, Benevolence, Universalism), including both strong endorsements and explicit rejections of opposing values.
Provide 14 sequential conversational turns spaced across timestamps from 0 to 195 seconds.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              channel: { type: Type.STRING },
              durationSeconds: { type: Type.INTEGER },
              speaker1Name: { type: Type.STRING },
              speaker1Role: { type: Type.STRING },
              speaker2Name: { type: Type.STRING },
              speaker2Role: { type: Type.STRING },
              turns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp: { type: Type.INTEGER },
                    endTime: { type: Type.INTEGER },
                    speakerId: {
                      type: Type.STRING,
                      description: 'Must be either "speaker_1" or "speaker_2"',
                    },
                    text: { type: Type.STRING },
                  },
                  required: ['timestamp', 'endTime', 'speakerId', 'text'],
                },
              },
            },
            required: [
              'title',
              'channel',
              'durationSeconds',
              'speaker1Name',
              'speaker1Role',
              'speaker2Name',
              'speaker2Role',
              'turns',
            ],
          },
        },
      });

      const data = JSON.parse(response.text?.trim() || '{}');
      res.json({
        videoId: videoId || 'aircAruvnKk',
        ...data,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to synthesize YouTube transcript' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Valuelizer server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
