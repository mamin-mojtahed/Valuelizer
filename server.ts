import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, MediaResolution, ThinkingLevel, Type } from '@google/genai';

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

// ============================================================================
// Persistent Disk-Backed Multi-Tier Cache System (.cache/)
// Ensures no conversation or evaluation is processed more than once across any user
// ============================================================================
const CACHE_ROOT = path.join(__dirname, '.cache');
const DEBATES_CACHE_DIR = path.join(CACHE_ROOT, 'debates');
const EVALUATIONS_CACHE_DIR = path.join(CACHE_ROOT, 'evaluations');
const EMBEDDINGS_CACHE_DIR = path.join(CACHE_ROOT, 'embeddings');
const VERIFICATIONS_CACHE_DIR = path.join(CACHE_ROOT, 'verifications');

for (const dir of [
  CACHE_ROOT,
  DEBATES_CACHE_DIR,
  EVALUATIONS_CACHE_DIR,
  EMBEDDINGS_CACHE_DIR,
  VERIFICATIONS_CACHE_DIR,
]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err: any) {
    console.warn('Could not create cache directory:', dir, err?.message);
  }
}

function sanitizeFileKey(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (cleaned.length > 0 && cleaned.length <= 120) {
    return cleaned;
  }
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  return `${cleaned.slice(0, 64)}_${hash}`;
}

function buildEvaluationCacheKey(params: {
  videoId: string;
  modelId: string;
  tau: number | string;
  useContextExpansion: boolean | string;
  enableFlashLiteVerifier: boolean | string;
  turnsCount?: number | string;
}): string {
  const vid = (params.videoId || 'unknown').trim();
  const model = (params.modelId || 'gemini-embedding-2').trim();
  const tauNum = Number(params.tau ?? 0.08);
  const tauStr = Number.isFinite(tauNum) ? tauNum.toFixed(3) : '0.080';
  const ctx = String(params.useContextExpansion) === 'false' ? '0' : '1';
  const ver = String(params.enableFlashLiteVerifier) === 'true' ? '1' : '0';
  const turns = params.turnsCount ? `_t${params.turnsCount}` : '';
  return sanitizeFileKey(`${vid}__${model}__tau${tauStr}__ctx${ctx}__ver${ver}${turns}`);
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  try {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err: any) {
    console.warn('Disk cache write warning:', filePath, err?.message);
  }
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (_err) {
    return null;
  }
}

interface CachedDebateRecord {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  speaker1Name: string;
  speaker1Role: string;
  speaker2Name: string;
  speaker2Role: string;
  turns: Array<{
    id: string;
    timestamp: number;
    endTime: number;
    speakerId: string;
    text: string;
  }>;
  cachedAt: string;
  hitCount: number;
  sourceType?: 'benchmark' | 'youtube-captions' | 'gemini-synthesized';
}

interface CachedEvaluationRecord {
  key: string;
  videoId: string;
  modelId: string;
  tau: number;
  useContextExpansion: boolean;
  enableFlashLiteVerifier: boolean;
  turnsCount: number;
  evaluated: any[];
  source: 'live-api' | 'local-wasm' | 'calibrated-engine';
  cachedAt: string;
  hitCount: number;
}

// In-memory hot mirrors backed by persistent disk files
const videoCache = new Map<string, CachedDebateRecord>();
const evaluationCache = new Map<string, CachedEvaluationRecord>();
const serverEmbeddingCache = new Map<string, number[]>();
const verifierCache = new Map<string, any>();

let totalCacheHits = 0;

// 1. Load pre-indexed benchmark debates and hydrate disk debate cache
const benchmarkDebatesPath = path.join(__dirname, 'src', 'constants', 'benchmarkDebates.json');
let BENCHMARK_DEBATES: Record<string, CachedDebateRecord> = {};

function reloadBenchmarkDebates(): Record<string, CachedDebateRecord> {
  try {
    const benchmarkDebatesList: any[] = JSON.parse(fs.readFileSync(benchmarkDebatesPath, 'utf-8'));
    const map: Record<string, CachedDebateRecord> = {};
    for (const debate of benchmarkDebatesList) {
      map[debate.videoId] = {
        videoId: debate.videoId,
        title: debate.title,
        channel: debate.channel,
        durationSeconds: debate.durationSeconds,
        speaker1Name: debate.speakers?.speaker_1?.name || 'Speaker 1',
        speaker1Role: debate.speakers?.speaker_1?.role || 'Host',
        speaker2Name: debate.speakers?.speaker_2?.name || 'Speaker 2',
        speaker2Role: debate.speakers?.speaker_2?.role || 'Guest',
        turns: debate.turns || [],
        cachedAt: '2026-10-20T00:00:00.000Z',
        hitCount: 1,
        sourceType: 'benchmark',
      };
    }
    BENCHMARK_DEBATES = map;
  } catch (e: any) {
    console.warn('Could not read benchmarkDebates.json:', e?.message);
  }
  return BENCHMARK_DEBATES;
}

reloadBenchmarkDebates();

function isPlaceholderPoisonedRecord(rec: CachedDebateRecord | null | undefined): boolean {
  if (!rec || !Array.isArray(rec.turns) || rec.turns.length === 0) return true;
  return rec.turns.some(
    (t) =>
      typeof t.text === 'string' &&
      (t.text.includes('From this perspective, empirical evidence and demonstrable predictability are essential.') ||
        t.text.includes('Today we discuss the foundational arguments regarding http'))
  );
}

function hydrateCachesFromDisk(): void {
  // Hydrate debates from disk (purging any stale placeholder-poisoned cache files)
  try {
    const files = fs.readdirSync(DEBATES_CACHE_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const fullPath = path.join(DEBATES_CACHE_DIR, file);
      const rec = readJsonSafe<CachedDebateRecord>(fullPath);
      if (rec && isPlaceholderPoisonedRecord(rec)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (_e) {
          // Ignore
        }
        continue;
      }
      if (rec && rec.videoId && Array.isArray(rec.turns) && rec.turns.length > 0) {
        videoCache.set(rec.videoId, rec);
      }
    }
  } catch (_e) {
    // Ignore read dir error
  }

  // Ensure benchmark debates exist in videoCache and on disk
  for (const [vid, bench] of Object.entries(BENCHMARK_DEBATES)) {
    if (!videoCache.has(vid)) {
      videoCache.set(vid, bench);
      const filePath = path.join(DEBATES_CACHE_DIR, `${sanitizeFileKey(vid)}.json`);
      if (!fs.existsSync(filePath)) {
        writeJsonAtomic(filePath, bench);
      }
    }
  }

  // Hydrate evaluations from disk
  try {
    const evalFiles = fs.readdirSync(EVALUATIONS_CACHE_DIR).filter((f) => f.endsWith('.json'));
    for (const file of evalFiles) {
      const rec = readJsonSafe<CachedEvaluationRecord>(path.join(EVALUATIONS_CACHE_DIR, file));
      if (rec && rec.key && Array.isArray(rec.evaluated)) {
        evaluationCache.set(rec.key, rec);
      }
    }
  } catch (_e) {
    // Ignore
  }

  // Hydrate text embeddings from disk
  try {
    const embFile = path.join(EMBEDDINGS_CACHE_DIR, 'embeddings_store.json');
    const storedEmbeddings = readJsonSafe<Record<string, number[]>>(embFile);
    if (storedEmbeddings && typeof storedEmbeddings === 'object') {
      for (const [k, vec] of Object.entries(storedEmbeddings)) {
        if (Array.isArray(vec)) {
          serverEmbeddingCache.set(k, vec);
        }
      }
    }
  } catch (_e) {
    // Ignore
  }

  // Hydrate verifier audits from disk
  try {
    const verFile = path.join(VERIFICATIONS_CACHE_DIR, 'verifier_store.json');
    const storedVerifications = readJsonSafe<Record<string, any>>(verFile);
    if (storedVerifications && typeof storedVerifications === 'object') {
      for (const [k, val] of Object.entries(storedVerifications)) {
        verifierCache.set(k, val);
      }
    }
  } catch (_e) {
    // Ignore
  }
}

hydrateCachesFromDisk();

let embeddingFlushTimer: NodeJS.Timeout | null = null;
function scheduleEmbeddingDiskFlush(): void {
  if (embeddingFlushTimer) return;
  embeddingFlushTimer = setTimeout(() => {
    embeddingFlushTimer = null;
    try {
      const obj: Record<string, number[]> = {};
      for (const [k, v] of serverEmbeddingCache.entries()) {
        obj[k] = v;
      }
      writeJsonAtomic(path.join(EMBEDDINGS_CACHE_DIR, 'embeddings_store.json'), obj);
    } catch (_e) {
      // Ignore
    }
  }, 1000);
}

function persistDebateToDisk(record: CachedDebateRecord): void {
  videoCache.set(record.videoId, record);
  const filePath = path.join(DEBATES_CACHE_DIR, `${sanitizeFileKey(record.videoId)}.json`);
  writeJsonAtomic(filePath, record);
}

function persistEvaluationToDisk(record: CachedEvaluationRecord): void {
  evaluationCache.set(record.key, record);
  const filePath = path.join(EVALUATIONS_CACHE_DIR, `${record.key}.json`);
  writeJsonAtomic(filePath, record);
}

function invalidateVideoCaches(videoId: string): {
  removedDebate: boolean;
  removedEvaluations: number;
} {
  const cleanId = (videoId || '').trim();
  if (!cleanId) return { removedDebate: false, removedEvaluations: 0 };

  const hadDebate = videoCache.delete(cleanId);
  const debateFile = path.join(DEBATES_CACHE_DIR, `${sanitizeFileKey(cleanId)}.json`);
  try {
    if (fs.existsSync(debateFile)) {
      fs.unlinkSync(debateFile);
    }
  } catch (_e) {
    // Ignore
  }

  let removedEvaluations = 0;
  const prefix = `${sanitizeFileKey(cleanId)}__`;
  for (const [k, rec] of Array.from(evaluationCache.entries())) {
    if (rec.videoId === cleanId || k.startsWith(prefix)) {
      evaluationCache.delete(k);
      removedEvaluations++;
      const evalFile = path.join(EVALUATIONS_CACHE_DIR, `${k}.json`);
      try {
        if (fs.existsSync(evalFile)) {
          fs.unlinkSync(evalFile);
        }
      } catch (_e) {
        // Ignore
      }
    }
  }

  reloadBenchmarkDebates();
  return { removedDebate: hadDebate, removedEvaluations };
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
  let channel = '';
  let duration = 0;
  let tracks: any[] = [];

  // 1. Try ANDROID InnerTube client for both metadata and captionTracks
  try {
    const res = await fetch(INNERTUBE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': INNERTUBE_USER_AGENT },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      title = data?.videoDetails?.title || '';
      channel = data?.videoDetails?.author || '';
      duration = parseInt(data?.videoDetails?.lengthSeconds || '0', 10) || 0;
      tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    }
  } catch (e: any) {
    console.warn('InnerTube ANDROID metadata fetch warning:', e?.message);
  }

  // 2. If ANDROID returned LOGIN_REQUIRED on cloud IP, fetch authentic videoDetails via ANDROID_TESTSUITE
  if (!title || !duration) {
    try {
      const tsRes = await fetch(INNERTUBE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: { clientName: 'ANDROID_TESTSUITE', clientVersion: '1.9', hl: 'en', gl: 'US' },
          },
          videoId,
        }),
      });
      if (tsRes.ok) {
        const tsData = (await tsRes.json()) as any;
        if (!title && tsData?.videoDetails?.title) title = tsData.videoDetails.title;
        if (!channel && tsData?.videoDetails?.author) channel = tsData.videoDetails.author;
        if (!duration && tsData?.videoDetails?.lengthSeconds) {
          duration = parseInt(tsData.videoDetails.lengthSeconds, 10) || 0;
        }
        if (tracks.length === 0) {
          tracks = tsData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        }
      }
    } catch (e: any) {
      console.warn('InnerTube ANDROID_TESTSUITE metadata fetch warning:', e?.message);
    }
  }

  // 3. Fallback to YouTube oEmbed for title and author if still missing
  if (!title || !channel) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`;
      const oemRes = await fetch(oembedUrl);
      if (oemRes.ok) {
        const oemData = (await oemRes.json()) as any;
        if (!title && oemData?.title) title = oemData.title;
        if (!channel && oemData?.author_name) channel = oemData.author_name;
      }
    } catch (_e) {
      // Ignore oembed error
    }
  }

  if (!channel) channel = 'YouTube';
  if (!duration) duration = 180;

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
  app.use(express.json({ limit: '15mb' }));

  // Health & capability status endpoint
  app.get('/api/status', (_req, res) => {
    res.json({
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      cacheStats: {
        debatesCached: videoCache.size,
        evaluationsCached: evaluationCache.size,
        embeddingsCached: serverEmbeddingCache.size,
        totalCacheHits,
      },
    });
  });

  // Shared Persistent Cache Telemetry & Community Processed Debates Endpoint
  app.get('/api/cache/stats', (_req, res) => {
    const debatesList = Array.from(videoCache.values())
      .map((d) => ({
        videoId: d.videoId,
        title: d.title,
        channel: d.channel,
        durationSeconds: d.durationSeconds,
        speaker1Name: d.speaker1Name,
        speaker1Role: d.speaker1Role,
        speaker2Name: d.speaker2Name,
        speaker2Role: d.speaker2Role,
        turnsCount: d.turns?.length || 0,
        cachedAt: d.cachedAt,
        hitCount: d.hitCount || 1,
        sourceType: d.sourceType || 'youtube-captions',
      }))
      .sort((a, b) => (b.cachedAt || '').localeCompare(a.cachedAt || ''));

    res.json({
      debatesCached: videoCache.size,
      evaluationsCached: evaluationCache.size,
      embeddingsCached: serverEmbeddingCache.size,
      verificationsCached: verifierCache.size,
      totalCacheHits,
      recentDebates: debatesList,
    });
  });

  // Retrieve a full cached conversation by videoId
  app.get('/api/cache/debate/:videoId', (req, res) => {
    const startMs = performance.now();
    const { videoId } = req.params;
    const hit = videoCache.get(videoId);
    if (!hit) {
      res.status(404).json({ error: 'Debate not found in cache' });
      return;
    }
    hit.hitCount = (hit.hitCount || 1) + 1;
    totalCacheHits++;
    persistDebateToDisk(hit);
    const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
    res.json({
      ...hit,
      fromCache: true,
      cacheLatencyMs: latencyMs,
    });
  });

  // Tier 2: Check for precomputed Schwartz vector evaluation in shared disk cache
  app.get('/api/evaluation-cache', (req, res) => {
    const startMs = performance.now();
    const {
      videoId = '',
      modelId = 'gemini-embedding-2',
      tau = '0.08',
      useContextExpansion = 'true',
      enableFlashLiteVerifier = 'false',
      turnsCount = '',
    } = req.query as Record<string, string>;

    if (!videoId) {
      res.json({ hit: false });
      return;
    }

    const key = buildEvaluationCacheKey({
      videoId,
      modelId,
      tau,
      useContextExpansion,
      enableFlashLiteVerifier,
      turnsCount,
    });

    let record = evaluationCache.get(key);
    if (!record) {
      const diskPath = path.join(EVALUATIONS_CACHE_DIR, `${key}.json`);
      const diskRecord = readJsonSafe<CachedEvaluationRecord>(diskPath);
      if (diskRecord && Array.isArray(diskRecord.evaluated) && diskRecord.evaluated.length > 0) {
        evaluationCache.set(key, diskRecord);
        record = diskRecord;
      }
    }

    if (record && Array.isArray(record.evaluated) && record.evaluated.length > 0) {
      record.hitCount = (record.hitCount || 1) + 1;
      totalCacheHits++;
      persistEvaluationToDisk(record);
      const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
      res.json({
        hit: true,
        key: record.key,
        evaluated: record.evaluated,
        source: record.source,
        cachedAt: record.cachedAt,
        hitCount: record.hitCount,
        latencyMs,
      });
      return;
    }

    res.json({ hit: false, key });
  });

  // Tier 2: Persist computed Schwartz vector evaluation to shared disk cache
  app.post('/api/evaluation-cache', (req, res) => {
    try {
      const {
        videoId,
        modelId,
        tau = 0.08,
        useContextExpansion = true,
        enableFlashLiteVerifier = false,
        turnsCount,
        evaluated,
        source = 'calibrated-engine',
      } = req.body as {
        videoId: string;
        modelId: string;
        tau?: number;
        useContextExpansion?: boolean;
        enableFlashLiteVerifier?: boolean;
        turnsCount?: number;
        evaluated: any[];
        source?: 'live-api' | 'local-wasm' | 'calibrated-engine';
      };

      if (!videoId || !modelId || !Array.isArray(evaluated) || evaluated.length === 0) {
        res.status(400).json({ error: 'videoId, modelId, and non-empty evaluated array are required' });
        return;
      }

      const key = buildEvaluationCacheKey({
        videoId,
        modelId,
        tau,
        useContextExpansion,
        enableFlashLiteVerifier,
        turnsCount,
      });

      const existing = evaluationCache.get(key);
      const record: CachedEvaluationRecord = {
        key,
        videoId,
        modelId,
        tau: Number(tau),
        useContextExpansion: Boolean(useContextExpansion),
        enableFlashLiteVerifier: Boolean(enableFlashLiteVerifier),
        turnsCount: Number(turnsCount || evaluated.length),
        evaluated,
        source,
        cachedAt: new Date().toISOString(),
        hitCount: existing ? (existing.hitCount || 1) + 1 : 1,
      };

      persistEvaluationToDisk(record);

      res.json({
        saved: true,
        key,
        cachedAt: record.cachedAt,
        hitCount: record.hitCount,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Could not save evaluation cache' });
    }
  });

  // Explicit User-Confirmed Cache Invalidation Endpoint
  app.post('/api/cache/invalidate', (req, res) => {
    const { videoId } = req.body as { videoId?: string };
    if (!videoId) {
      res.status(400).json({ error: 'videoId is required' });
      return;
    }
    const result = invalidateVideoCaches(videoId);
    res.json({
      invalidated: true,
      videoId,
      ...result,
    });
  });

  // Rate-limit considerate pacing state for outbound Gemini embedding calls
  let lastEmbedApiCallAt = 0;
  const MIN_EMBED_INTERVAL_MS = 380;
  let embedQueuePromise: Promise<void> = Promise.resolve();

  function runPacedEmbedTask<T>(fn: () => Promise<T>): Promise<T> {
    const next = embedQueuePromise.then(async () => {
      const elapsed = Date.now() - lastEmbedApiCallAt;
      if (elapsed < MIN_EMBED_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, MIN_EMBED_INTERVAL_MS - elapsed));
      }
      try {
        return await fn();
      } finally {
        lastEmbedApiCallAt = Date.now();
      }
    });
    embedQueuePromise = next.then(
      () => {},
      () => {}
    );
    return next;
  }

  // Batch Embedding Endpoint for Gemini Embedding 2 & Gemini Embedding 001 (Rate-Limit Paced)
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

      const resolvedModel =
        model === 'gemini-embedding-2' || model === 'gemini-embedding-2-preview'
          ? 'gemini-embedding-2-preview'
          : 'gemini-embedding-001';

      // Check persistent server embedding cache first
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
        totalCacheHits++;
        res.json({
          model: resolvedModel,
          dimensions: allEmbeddings[0]?.length || 0,
          embeddings: allEmbeddings,
          fromCache: true,
        });
        return;
      }

      const ai = getGenAIClient();

      // Chunk remaining in rate-limit considerate batches of 18 with paced intervals and retry backoff
      const batchSize = 18;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const chunk = uncachedTexts.slice(i, i + batchSize);
        const indicesChunk = uncachedIndices.slice(i, i + batchSize);

        // Re-check cache in case a parallel queued request already populated any of these strings
        const stillUncachedTexts: string[] = [];
        const stillUncachedOriginalIndices: number[] = [];
        chunk.forEach((txt, idx) => {
          const k = resolvedModel + '::' + txt;
          if (serverEmbeddingCache.has(k)) {
            allEmbeddings[indicesChunk[idx]] = serverEmbeddingCache.get(k)!;
          } else {
            stillUncachedTexts.push(txt);
            stillUncachedOriginalIndices.push(indicesChunk[idx]);
          }
        });

        if (stillUncachedTexts.length === 0) continue;

        try {
          const embeddings = await runPacedEmbedTask(async () => {
            let lastErr: any = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                if (attempt > 0) {
                  const backoffMs = attempt * 1100;
                  await new Promise((r) => setTimeout(r, backoffMs));
                }
                const result = await ai.models.embedContent({
                  model: resolvedModel,
                  contents: stillUncachedTexts.map((t) => ({ parts: [{ text: t }] })),
                });
                return (result.embeddings || []).map((e) => e.values || []);
              } catch (err: any) {
                lastErr = err;
                const msg = String(err?.message || '');
                if (!msg.includes('429') && !msg.toLowerCase().includes('quota') && !msg.toLowerCase().includes('rate')) {
                  break;
                }
              }
            }
            throw lastErr;
          });

          embeddings.forEach((vec, idx) => {
            const originalIndex = stillUncachedOriginalIndices[idx];
            allEmbeddings[originalIndex] = vec;
            serverEmbeddingCache.set(resolvedModel + '::' + stillUncachedTexts[idx], vec);
          });
        } catch (embedErr: any) {
          console.warn('ai.models.embedContent rate-limited or error:', embedErr?.message);
          res.status(429).json({ error: 'Embedding rate limit reached. Falling back to calibrated local engine.' });
          return;
        }
      }

      scheduleEmbeddingDiskFlush();

      res.json({
        model: resolvedModel,
        dimensions: allEmbeddings[0]?.length || 0,
        embeddings: allEmbeddings,
        fromCache: false,
      });
    } catch (error: any) {
      const message = error?.message || 'Gemini embedding request failed';
      res.status(500).json({ error: message });
    }
  });

  // OpenAI Embedding Endpoint with Persistent Server Cache
  app.post('/api/embed-openai', async (req, res) => {
    try {
      const { texts, model = 'text-embedding-3-small' } = req.body as {
        texts: string[];
        model?: string;
      };

      if (!Array.isArray(texts) || texts.length === 0) {
        res.status(400).json({ error: 'texts array is required' });
        return;
      }

      const allEmbeddings: number[][] = new Array(texts.length);
      const uncachedIndices: number[] = [];
      const uncachedTexts: string[] = [];

      texts.forEach((t, i) => {
        const cacheKey = `openai:${model}::${t}`;
        if (serverEmbeddingCache.has(cacheKey)) {
          allEmbeddings[i] = serverEmbeddingCache.get(cacheKey)!;
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(t);
        }
      });

      if (uncachedTexts.length === 0) {
        totalCacheHits++;
        res.json({
          model,
          dimensions: allEmbeddings[0]?.length || 1536,
          embeddings: allEmbeddings,
          fromCache: true,
        });
        return;
      }

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
          input: uncachedTexts,
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
      embeddings.forEach((vec, idx) => {
        const originalIndex = uncachedIndices[idx];
        allEmbeddings[originalIndex] = vec;
        serverEmbeddingCache.set(`openai:${model}::${uncachedTexts[idx]}`, vec);
      });

      scheduleEmbeddingDiskFlush();

      res.json({
        model,
        dimensions: allEmbeddings[0]?.length || 1536,
        embeddings: allEmbeddings,
        fromCache: false,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'OpenAI embedding request failed' });
    }
  });

  // Flash-Lite Hybrid Verifier Endpoint with Disk Cache
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

      const batchHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(utterances.map((u) => ({ id: u.id, t: u.text, c: u.candidateValues }))))
        .digest('hex')
        .slice(0, 24);

      if (verifierCache.has(batchHash)) {
        totalCacheHits++;
        res.json({ verifications: verifierCache.get(batchHash), fromCache: true });
        return;
      }

      const ai = getGenAIClient();
      const prompt = `You are a psychometric auditor specializing in Shalom H. Schwartz's Theory of Basic Human Values.
For each speaker utterance below, verify whether the speaker is genuinely endorsing (+) or rejecting/subordinating (-) the top candidate values.

Input Utterances:
${JSON.stringify(utterances, null, 2)}`;

      const FAST_TEXT_MODELS = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.8-flash',
        'gemini-flash-latest',
      ];

      let responseText = '[]';
      let lastVerifierErr: any = null;
      for (const mId of FAST_TEXT_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: mId,
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
          if (response.text) {
            responseText = response.text;
            lastVerifierErr = null;
            break;
          }
        } catch (err: any) {
          lastVerifierErr = err;
        }
      }
      if (lastVerifierErr && responseText === '[]') {
        throw lastVerifierErr;
      }

      const parsed = JSON.parse(responseText.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        verifierCache.set(batchHash, parsed);
        try {
          const obj: Record<string, any> = {};
          for (const [k, v] of verifierCache.entries()) obj[k] = v;
          writeJsonAtomic(path.join(VERIFICATIONS_CACHE_DIR, 'verifier_store.json'), obj);
        } catch (_e) {
          // Ignore
        }
      }
      res.json({ verifications: parsed, fromCache: false });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Flash verification failed' });
    }
  });

  function parseTimestampToSeconds(val: unknown, fallbackSec: number, maxDurationSec?: number): number {
    let sec = fallbackSec;
    if (typeof val === 'number' && Number.isFinite(val)) {
      sec = val;
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.includes(':')) {
        const parts = trimmed.split(':').map((p) => parseFloat(p));
        if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
          sec = parts[0] * 60 + parts[1];
        } else if (
          parts.length === 3 &&
          Number.isFinite(parts[0]) &&
          Number.isFinite(parts[1]) &&
          Number.isFinite(parts[2])
        ) {
          sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      } else {
        const num = parseFloat(trimmed);
        if (Number.isFinite(num)) sec = num;
      }
    }
    sec = Math.max(0, Math.round(sec * 10) / 10);
    if (maxDurationSec && maxDurationSec > 0 && sec > maxDurationSec) {
      sec = maxDurationSec;
    }
    return sec;
  }

  // Dynamic YouTube Conversation Ingestion / Search Synthesis with Persistent Disk Cache
  app.post('/api/youtube-ingest', async (req, res) => {
    const startMs = performance.now();
    const { queryOrUrl, videoId, forceReanalyze = false } = req.body as {
      queryOrUrl: string;
      videoId?: string;
      forceReanalyze?: boolean;
    };

    // Extract 11-char video ID if present
    const urlPattern = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = (queryOrUrl || '').match(urlPattern);
    const resolvedVideoId = match
      ? match[1]
      : videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? videoId
      : `topic_${crypto
          .createHash('sha256')
          .update((queryOrUrl || 'debate').toLowerCase().trim())
          .digest('hex')
          .slice(0, 9)}`;

    if (forceReanalyze && resolvedVideoId) {
      invalidateVideoCaches(resolvedVideoId);
    }

    // 1. Check persistent memory & disk cache first (unless forceReanalyze is requested)
    if (!forceReanalyze && resolvedVideoId) {
      let cached = videoCache.get(resolvedVideoId);
      if (!cached) {
        const diskFile = path.join(DEBATES_CACHE_DIR, `${sanitizeFileKey(resolvedVideoId)}.json`);
        const diskData = readJsonSafe<CachedDebateRecord>(diskFile);
        if (diskData && !isPlaceholderPoisonedRecord(diskData)) {
          videoCache.set(resolvedVideoId, diskData);
          cached = diskData;
        } else if (diskData) {
          invalidateVideoCaches(resolvedVideoId);
        }
      } else if (isPlaceholderPoisonedRecord(cached)) {
        invalidateVideoCaches(resolvedVideoId);
        cached = undefined;
      }

      if (cached) {
        cached.hitCount = (cached.hitCount || 1) + 1;
        totalCacheHits++;
        persistDebateToDisk(cached);
        const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
        res.json({
          ...cached,
          fromCache: true,
          cacheLatencyMs: latencyMs,
        });
        return;
      }
    }

    // 2. Check pre-indexed benchmark debates when not forcing a live re-analysis
    reloadBenchmarkDebates();
    if (!forceReanalyze && resolvedVideoId && BENCHMARK_DEBATES[resolvedVideoId]) {
      const benchmark: CachedDebateRecord = {
        ...BENCHMARK_DEBATES[resolvedVideoId],
        cachedAt: new Date().toISOString(),
        hitCount: 1,
      };
      persistDebateToDisk(benchmark);
      const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
      res.json({
        ...benchmark,
        fromCache: true,
        cacheLatencyMs: latencyMs,
      });
      return;
    }

    // 3. Fetch authentic YouTube metadata and captions via InnerTube + oEmbed
    const isRealYouTubeId = /^[a-zA-Z0-9_-]{11}$/.test(resolvedVideoId);
    const ytMeta = isRealYouTubeId
      ? await fetchYouTubeCaptionsAndMetadata(resolvedVideoId)
      : { title: queryOrUrl, channel: 'YouTube', duration: 180, rawCues: [] };

    const benchmarkFallback = BENCHMARK_DEBATES[resolvedVideoId];
    let title = ytMeta.title || benchmarkFallback?.title || queryOrUrl || 'YouTube Conversation';
    let channel = ytMeta.channel || benchmarkFallback?.channel || 'YouTube';
    let duration = ytMeta.duration || benchmarkFallback?.durationSeconds || 180;
    const rawCues = ytMeta.rawCues || [];

    let speaker1Name = benchmarkFallback?.speaker1Name || 'Speaker 1';
    let speaker2Name = benchmarkFallback?.speaker2Name || 'Speaker 2';
    let speaker1Role = benchmarkFallback?.speaker1Role || 'Primary Interlocutor';
    let speaker2Role = benchmarkFallback?.speaker2Role || 'Counter-Interlocutor';
    let sourceType: 'benchmark' | 'youtube-captions' | 'gemini-synthesized' = 'youtube-captions';

    let parsedTurns: Array<{
      id: string;
      timestamp: number;
      endTime: number;
      speakerId: string;
      text: string;
    }> = [];

    const TRANSCRIPTION_MODELS = [
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ];

    // Branch A: Authentic XML captions directly returned from YouTube
    if (rawCues.length > 0) {
      sourceType = 'youtube-captions';
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

        for (const mId of TRANSCRIPTION_MODELS) {
          try {
            const geminiRes = await ai.models.generateContent({
              model: mId,
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
            break;
          } catch (mErr: any) {
            console.warn(`Caption diarization model ${mId} notice:`, mErr?.message?.slice(0, 120));
          }
        }
      } catch (err: any) {
        console.warn('Diarization notice:', err?.message);
      }

      // Fallback if Gemini diarization fails: alternate speakers based on speech pauses
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
    // Branch B: Real YouTube video where InnerTube captions were blocked -> Use Gemini native YouTube video ingestion (fileData) for verbatim transcription
    else if (isRealYouTubeId) {
      sourceType = 'youtube-captions';
      const youtubeWatchUrl = `https://www.youtube.com/watch?v=${resolvedVideoId}`;
      const durationFormatted = `${Math.floor(duration / 60)
        .toString()
        .padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}`;

      try {
        const ai = getGenAIClient();
        for (const mId of TRANSCRIPTION_MODELS) {
          try {
            const isGemini3 = mId.startsWith('gemini-3');
            const geminiRes = await ai.models.generateContent({
              model: mId,
              contents: [
                {
                  fileData: {
                    fileUri: youtubeWatchUrl,
                    mimeType: 'video/mp4',
                  },
                },
                {
                  text: `Transcribe the spoken dialogue in this YouTube video ("${title}" by ${channel}, duration ${durationFormatted} / ${duration}s) verbatim, sentence by sentence, in chronological order from start to finish.
Identify the 2 primary opposing speakers (speaker_1 and speaker_2) with their real full names and roles.
For each spoken sentence/turn, provide the exact startTime and endTime in "MM:SS" format (e.g., "00:00", "01:15", "${durationFormatted}"), speakerId ("speaker_1" or "speaker_2"), and the verbatim spoken text. Do not invent or summarize; transcribe the actual words spoken in the video.`,
                },
              ],
              config: {
                mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
                ...(isGemini3
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : mId.startsWith('gemini-2.5')
                  ? { thinkingConfig: { thinkingBudget: 0 } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    channel: { type: Type.STRING },
                    speaker1Name: { type: Type.STRING },
                    speaker1Role: { type: Type.STRING },
                    speaker2Name: { type: Type.STRING },
                    speaker2Role: { type: Type.STRING },
                    turns: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          startTime: {
                            type: Type.STRING,
                            description: 'Start timestamp in MM:SS format, e.g. 00:00 or 02:14',
                          },
                          endTime: {
                            type: Type.STRING,
                            description: 'End timestamp in MM:SS format, e.g. 00:05 or 02:26',
                          },
                          speakerId: {
                            type: Type.STRING,
                            enum: ['speaker_1', 'speaker_2'],
                          },
                          text: { type: Type.STRING },
                        },
                        required: ['startTime', 'endTime', 'speakerId', 'text'],
                      },
                    },
                  },
                  required: [
                    'title',
                    'channel',
                    'speaker1Name',
                    'speaker1Role',
                    'speaker2Name',
                    'speaker2Role',
                    'turns',
                  ],
                },
              },
            });

            const parsed = JSON.parse(geminiRes.text?.trim() || '{}');
            if (Array.isArray(parsed.turns) && parsed.turns.length > 0) {
              if (!ytMeta.title && parsed.title) title = parsed.title;
              if (channel === 'YouTube' && parsed.channel) channel = parsed.channel;
              if (parsed.speaker1Name) speaker1Name = parsed.speaker1Name;
              if (parsed.speaker2Name) speaker2Name = parsed.speaker2Name;
              if (parsed.speaker1Role) speaker1Role = parsed.speaker1Role;
              if (parsed.speaker2Role) speaker2Role = parsed.speaker2Role;

              parsedTurns = parsed.turns
                .map((t: any, idx: number) => {
                  const startSec = parseTimestampToSeconds(
                    t.startTime ?? t.timestamp,
                    idx * 6,
                    duration
                  );
                  const rawEndSec = parseTimestampToSeconds(
                    t.endTime,
                    startSec + 5,
                    duration
                  );
                  const endSec = Math.max(startSec + 1, rawEndSec);
                  const spk = String(t.speakerId || '').includes('2') ? 'speaker_2' : 'speaker_1';
                  return {
                    id: 'turn-' + (idx + 1),
                    timestamp: Math.round(startSec * 10) / 10,
                    endTime: Math.round(endSec * 10) / 10,
                    speakerId: spk,
                    text: (t.text || '').trim(),
                  };
                })
                .filter((t: any) => t.text.length > 0);

              if (parsedTurns.length > 0) {
                break;
              }
            }
          } catch (mErr: any) {
            console.warn(
              `Native YouTube transcription with ${mId} failed, trying next model:`,
              mErr?.message?.slice(0, 160)
            );
          }
        }
      } catch (err: any) {
        console.warn('Gemini native YouTube transcription error:', err?.message);
      }

      if (parsedTurns.length === 0 && benchmarkFallback && benchmarkFallback.turns.length > 0) {
        sourceType = 'benchmark';
        parsedTurns = benchmarkFallback.turns;
      }
    }
    // Branch C: Free-text topic search query (not a YouTube video ID)
    else {
      sourceType = 'gemini-synthesized';
      try {
        const ai = getGenAIClient();
        const prompt = `You are a dialogue analyst. Given the debate topic "${title}" (duration ${duration}s), generate a realistic dialogue between 2 primary opposing speakers.
All turn timestamps must start at 0 and strictly never exceed ${duration} seconds.
Return JSON: { "speaker1Name": "...", "speaker1Role": "...", "speaker2Name": "...", "speaker2Role": "...", "turns": [ { "timestamp": 0, "endTime": 6, "speakerId": "speaker_1", "text": "..." } ] }`;

        for (const mId of TRANSCRIPTION_MODELS) {
          try {
            const geminiRes = await ai.models.generateContent({
              model: mId,
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
                speakerId: String(t.speakerId || '').includes('2') ? 'speaker_2' : 'speaker_1',
                text: (t.text || '').trim(),
              }));
              break;
            }
          } catch (_e) {
            // Try next model
          }
        }
      } catch (err: any) {
        console.warn('Topic synthesis notice:', err?.message);
      }
    }

    const finalTurns = parsedTurns.filter((t: any) => t.text && t.text.length > 0);
    if (finalTurns.length === 0) {
      res.status(502).json({
        error:
          'Unable to transcribe this YouTube stream right now due to temporary model capacity. Please try again in a moment.',
      });
      return;
    }

    const maxEnd = finalTurns.length > 0 ? Math.max(...finalTurns.map((t: any) => t.endTime)) : duration;
    const finalDuration = Math.max(duration, maxEnd);

    const result: CachedDebateRecord = {
      videoId: resolvedVideoId,
      title,
      channel,
      durationSeconds: finalDuration,
      speaker1Name,
      speaker1Role,
      speaker2Name,
      speaker2Role,
      turns: finalTurns,
      cachedAt: new Date().toISOString(),
      hitCount: 1,
      sourceType,
    };

    if (resolvedVideoId) {
      persistDebateToDisk(result);
    }

    const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
    res.json({
      ...result,
      fromCache: false,
      reanalyzed: Boolean(forceReanalyze),
      cacheLatencyMs: latencyMs,
    });
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
