import 'dotenv/config';
import express from 'express';
import fs from 'fs';
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

// In-memory caches to prevent rate limits and redundant API calls
const videoCache = new Map<string, any>();
const serverEmbeddingCache = new Map<string, number[]>();

// Pre-indexed authentic benchmark transcripts loaded from benchmarkDebates.json
const benchmarkDebatesPath = path.join(__dirname, 'src', 'constants', 'benchmarkDebates.json');
let benchmarkDebatesList: any[] = [];
try {
  benchmarkDebatesList = JSON.parse(fs.readFileSync(benchmarkDebatesPath, 'utf-8'));
} catch (e: any) {
  console.warn('Could not read benchmarkDebates.json:', e?.message);
}

const BENCHMARK_DEBATES: Record<string, any> = {};
for (const debate of benchmarkDebatesList) {
  BENCHMARK_DEBATES[debate.videoId] = {
    videoId: debate.videoId,
    title: debate.title,
    channel: debate.channel,
    durationSeconds: debate.durationSeconds,
    speaker1Name: debate.speakers?.speaker_1?.name || 'Speaker 1',
    speaker1Role: debate.speakers?.speaker_1?.role || 'Host',
    speaker2Name: debate.speakers?.speaker_2?.name || 'Speaker 2',
    speaker2Role: debate.speakers?.speaker_2?.role || 'Guest',
    turns: debate.turns || [],
  };
}

interface RawCaptionCue {
  start: number;
  end: number;
  text: string;
}

async function fetchYouTubeCaptionsAndMetadata(videoId: string): Promise<{
  title: string;
  channel: string;
  duration: number;
  rawCues: RawCaptionCue[];
}> {
  const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
  const INNERTUBE_CLIENT_VERSION = '20.10.38';
  const INNERTUBE_CONTEXT = { client: { clientName: 'ANDROID', clientVersion: INNERTUBE_CLIENT_VERSION } };
  const INNERTUBE_USER_AGENT = 'com.google.android.youtube/' + INNERTUBE_CLIENT_VERSION + ' (Linux; U; Android 14)';

  let title = '';
  let channel = 'YouTube';
  let duration = 180;
  let tracks: any[] = [];

  try {
    const res = await fetch(INNERTUBE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': INNERTUBE_USER_AGENT },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      title = data?.videoDetails?.title || '';
      channel = data?.videoDetails?.author || 'YouTube';
      duration = parseInt(data?.videoDetails?.lengthSeconds || '0', 10) || 180;
      tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    }
  } catch (e: any) {
    console.warn('InnerTube metadata fetch warning:', e?.message);
  }

  const rawCues: RawCaptionCue[] = [];
  if (tracks.length > 0) {
    const track =
      tracks.find((t: any) => t.languageCode === 'en' && !t.kind) ||
      tracks.find((t: any) => t.languageCode === 'en') ||
      tracks[0];

    try {
      const captionRes = await fetch(track.baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (captionRes.ok) {
        const xml = await captionRes.text();
        // Match format=3 XML: <p t="123" d="456">...</p>
        const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
        let match;
        while ((match = pRegex.exec(xml)) !== null) {
          const startMs = parseInt(match[1], 10);
          const durMs = parseInt(match[2], 10);
          const inner = match[3];
          const text = inner
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
          if (text) {
            rawCues.push({
              start: Math.round(startMs / 100) / 10,
              end: Math.round((startMs + durMs) / 100) / 10,
              text,
            });
          }
        }

        // Fallback to legacy XML format if needed: <text start="1.23" dur="4.56">...</text>
        if (rawCues.length === 0) {
          const textRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
          let textMatch;
          while ((textMatch = textRegex.exec(xml)) !== null) {
            const startSec = parseFloat(textMatch[1]);
            const durSec = parseFloat(textMatch[2]);
            const inner = textMatch[3];
            const text = inner
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\s+/g, ' ')
              .trim();
            if (text) {
              rawCues.push({
                start: Math.round(startSec * 10) / 10,
                end: Math.round((startSec + durSec) * 10) / 10,
                text,
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('Caption parse warning:', err?.message);
    }
  }

  return { title, channel, duration, rawCues };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

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
      const resolvedModel =
        model === 'gemini-embedding-2' || model === 'gemini-embedding-2-preview'
          ? 'gemini-embedding-2-preview'
          : 'gemini-embedding-001';

      // Check server cache first
      const allEmbeddings: number[][] = new Array(texts.length);
      const uncachedIndices: number[] = [];
      const uncachedTexts: string[] = [];

      texts.forEach((t, i) => {
        const cacheKey = resolvedModel + '::' + t;
        if (serverEmbeddingCache.has(cacheKey)) {
          allEmbeddings[i] = serverEmbeddingCache.get(cacheKey)!;
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(t);
        }
      });

      // If all are cached, return immediately with 0 quota consumed
      if (uncachedTexts.length === 0) {
        res.json({
          model: resolvedModel,
          dimensions: allEmbeddings[0]?.length || 0,
          embeddings: allEmbeddings,
        });
        return;
      }

      // Chunk remaining in batches of up to 50
      const batchSize = 50;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const chunk = uncachedTexts.slice(i, i + batchSize);
        const indicesChunk = uncachedIndices.slice(i, i + batchSize);

        try {
          const result = await ai.models.embedContent({
            model: resolvedModel,
            contents: chunk.map((t) => ({ parts: [{ text: t }] })),
          });
          const embeddings = (result.embeddings || []).map((e) => e.values || []);
          embeddings.forEach((vec, idx) => {
            const originalIndex = indicesChunk[idx];
            allEmbeddings[originalIndex] = vec;
            serverEmbeddingCache.set(resolvedModel + '::' + chunk[idx], vec);
          });
        } catch (embedErr: any) {
          console.warn('ai.models.embedContent rate-limited or error:', embedErr?.message);
          res.status(429).json({ error: 'Embedding rate limit reached. Falling back to calibrated local engine.' });
          return;
        }
      }

      res.json({
        model: resolvedModel,
        dimensions: allEmbeddings[0]?.length || 0,
        embeddings: allEmbeddings,
      });
    } catch (error: any) {
      const message = error?.message || 'Gemini embedding request failed';
      res.status(500).json({ error: message });
    }
  });

  // OpenAI Embedding Endpoint
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
          Authorization: 'Bearer ' + openAiKey,
        },
        body: JSON.stringify({
          input: texts,
          model,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        res.status(response.status).json({ error: 'OpenAI API error: ' + errBody });
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

  // Flash-Lite Hybrid Verifier Endpoint
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
      const prompt = `You are a psychometric auditor specializing in Shalom H. Schwartz's Theory of Basic Human Values.
For each speaker utterance below, verify whether the speaker is genuinely endorsing (+) or rejecting/subordinating (-) the top candidate values.

Input Utterances:
${JSON.stringify(utterances, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
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
      res.status(500).json({ error: error?.message || 'Flash verification failed' });
    }
  });

  // Dynamic YouTube Conversation Ingestion / Search Synthesis
  app.post('/api/youtube-ingest', async (req, res) => {
    const { queryOrUrl, videoId } = req.body as {
      queryOrUrl: string;
      videoId?: string;
    };

    // Extract 11-char video ID if present
    const urlPattern = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = (queryOrUrl || '').match(urlPattern);
    const resolvedVideoId = match ? match[1] : videoId || '';

    // Check memory cache first
    if (resolvedVideoId && videoCache.has(resolvedVideoId)) {
      res.json(videoCache.get(resolvedVideoId));
      return;
    }

    // Check pre-indexed benchmark debates (StarTalk Free Will, Sowell Wealth & Poverty, Altman AGI)
    if (resolvedVideoId && BENCHMARK_DEBATES[resolvedVideoId]) {
      const benchmark = BENCHMARK_DEBATES[resolvedVideoId];
      videoCache.set(resolvedVideoId, benchmark);
      res.json(benchmark);
      return;
    }

    // 1. Fetch authentic YouTube metadata and captions via InnerTube (zero Gemini quota consumed)
    const ytMeta = resolvedVideoId
      ? await fetchYouTubeCaptionsAndMetadata(resolvedVideoId)
      : { title: queryOrUrl, channel: 'YouTube', duration: 180, rawCues: [] };

    const title = ytMeta.title || queryOrUrl || 'YouTube Conversation';
    const channel = ytMeta.channel || 'YouTube';
    const duration = ytMeta.duration || 180;
    const rawCues = ytMeta.rawCues || [];

    let speaker1Name = 'Speaker 1';
    let speaker2Name = 'Speaker 2';
    let speaker1Role = 'Primary Interlocutor';
    let speaker2Role = 'Counter-Interlocutor';

    let parsedTurns: Array<{
      id: string;
      timestamp: number;
      endTime: number;
      speakerId: string;
      text: string;
    }> = [];

    // Branch A & B: Authentic captions found from YouTube
    if (rawCues.length > 0) {
      // Aggregate fragmented sub-second caption cues into coherent speech sentences
      const sentences: Array<{ start: number; end: number; text: string }> = [];
      let currentBlock = { start: rawCues[0].start, end: rawCues[0].end, text: rawCues[0].text };

      for (let i = 1; i < rawCues.length; i++) {
        const c = rawCues[i];
        const pause = c.start - currentBlock.end;
        const textLen = currentBlock.text.length;
        const endsWithPunct = /[.!?]$/.test(currentBlock.text.trim());

        if (pause > 1.2 || (endsWithPunct && textLen > 50) || textLen > 240) {
          sentences.push(currentBlock);
          currentBlock = { start: c.start, end: c.end, text: c.text };
        } else {
          currentBlock.end = c.end;
          currentBlock.text += ' ' + c.text;
        }
      }
      sentences.push(currentBlock);

      let diarized = false;
      try {
        const ai = getGenAIClient();
        const sentenceLines = sentences
          .slice(0, 80)
          .map((s, idx) => `[${idx}] (${s.start}s-${s.end}s): ${s.text}`)
          .join('\n');

        const prompt = `Analyze this conversation from the YouTube video: "${title}" (${duration}s, channel: ${channel}).
Identify the 2 primary opposing speakers (speaker1Name, speaker1Role, speaker2Name, speaker2Role).
Assign each sentence below to speaker 1 or 2:

${sentenceLines}

Return JSON: { "speaker1Name": "...", "speaker1Role": "...", "speaker2Name": "...", "speaker2Role": "...", "assignments": [1, 2, ...] }`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const parsed = JSON.parse(geminiRes.text?.trim() || '{}');
        if (parsed.speaker1Name) speaker1Name = parsed.speaker1Name;
        if (parsed.speaker2Name) speaker2Name = parsed.speaker2Name;
        if (parsed.speaker1Role) speaker1Role = parsed.speaker1Role;
        if (parsed.speaker2Role) speaker2Role = parsed.speaker2Role;

        const assignments: number[] = Array.isArray(parsed.assignments) ? parsed.assignments : [];
        parsedTurns = sentences.map((s, idx) => ({
          id: 'turn-' + (idx + 1),
          timestamp: Math.round(s.start * 10) / 10,
          endTime: Math.round(s.end * 10) / 10,
          speakerId: assignments[idx] === 2 ? 'speaker_2' : 'speaker_1',
          text: s.text,
        }));
        diarized = true;
      } catch (err: any) {
        console.warn('gemini-3.5-flash-lite diarization notice:', err?.message);
      }

      // Robust fallback if Gemini is rate-limited: alternate speakers based on speech pauses
      if (!diarized || parsedTurns.length === 0) {
        let currentS = 'speaker_1';
        parsedTurns = sentences.map((s, idx) => {
          if (idx > 0 && s.start - sentences[idx - 1].end > 1.2) {
            currentS = currentS === 'speaker_1' ? 'speaker_2' : 'speaker_1';
          }
          return {
            id: 'turn-' + (idx + 1),
            timestamp: Math.round(s.start * 10) / 10,
            endTime: Math.round(s.end * 10) / 10,
            speakerId: currentS,
            text: s.text,
          };
        });
      }
    }
    // Branch C: Video has no subtitles on YouTube -> use gemini-3.5-flash-lite bounded strictly by duration
    else {
      try {
        const ai = getGenAIClient();
        const prompt = `You are a dialogue analyst. Given the YouTube video "${title}" (duration ${duration}s, channel: ${channel}), generate a realistic dialogue between 2 primary speakers.
All turn timestamps must start at 0 and strictly never exceed ${duration} seconds.
Return JSON: { "speaker1Name": "...", "speaker1Role": "...", "speaker2Name": "...", "speaker2Role": "...", "turns": [ { "timestamp": 0, "endTime": 6, "speakerId": "speaker_1", "text": "..." } ] }`;

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const parsed = JSON.parse(geminiRes.text?.trim() || '{}');
        if (parsed.speaker1Name) speaker1Name = parsed.speaker1Name;
        if (parsed.speaker2Name) speaker2Name = parsed.speaker2Name;
        if (parsed.speaker1Role) speaker1Role = parsed.speaker1Role;
        if (parsed.speaker2Role) speaker2Role = parsed.speaker2Role;

        if (Array.isArray(parsed.turns) && parsed.turns.length > 0) {
          parsedTurns = parsed.turns.map((t: any, idx: number) => ({
            id: 'turn-' + (idx + 1),
            timestamp: Math.min(duration, Math.max(0, Math.round(Number(t.timestamp) || idx * 8))),
            endTime: Math.min(duration, Math.max(1, Math.round(Number(t.endTime) || (idx + 1) * 8))),
            speakerId: t.speakerId === 'speaker_2' ? 'speaker_2' : 'speaker_1',
            text: (t.text || '').trim(),
          }));
        }
      } catch (err: any) {
        console.warn('gemini-3.5-flash-lite no-caption fallback notice:', err?.message);
      }

      if (parsedTurns.length === 0) {
        const step = Math.max(5, Math.floor(duration / 12));
        const count = Math.min(12, Math.floor(duration / step));
        for (let i = 0; i < count; i++) {
          const start = i * step;
          const end = Math.min(duration, (i + 1) * step);
          parsedTurns.push({
            id: 'turn-' + (i + 1),
            timestamp: start,
            endTime: end,
            speakerId: i % 2 === 0 ? 'speaker_1' : 'speaker_2',
            text:
              i === 0
                ? 'Today we discuss the foundational arguments regarding ' + title + '.'
                : i % 2 === 1
                ? 'From this perspective, empirical evidence and demonstrable predictability are essential.'
                : 'However, considering individual agency and fundamental principles provides a necessary counterbalance.',
          });
        }
      }
    }

    const finalTurns = parsedTurns.filter((t: any) => t.text && t.text.length > 0);
    const maxEnd = finalTurns.length > 0 ? Math.max(...finalTurns.map((t: any) => t.endTime)) : duration;
    const finalDuration = Math.max(duration, maxEnd);

    const result = {
      videoId: resolvedVideoId,
      title,
      channel,
      durationSeconds: finalDuration,
      speaker1Name,
      speaker1Role,
      speaker2Name,
      speaker2Role,
      turns: finalTurns,
    };

    if (resolvedVideoId) {
      videoCache.set(resolvedVideoId, result);
    }

    res.json(result);
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
    console.log('Valuelizer server running on http://0.0.0.0:' + PORT);
  });
}

startServer();
