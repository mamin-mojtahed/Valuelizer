import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDotDashed,
  Columns,
  Compass,
  Cpu,
  GitCompare,
  History,
  Layers,
  Play,
  RotateCcw,
  Search,
  Sliders,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  PRE_INDEXED_DEBATES,
  PreIndexedDebate,
  SCHWARTZ_CIRCUMPLEX_AXES,
  SchwartzValueId,
} from './constants/schwartzAnchors';
import {
  clearClientEmbeddingCache,
  EMBEDDING_MODELS,
  EmbeddingModelId,
  evaluateTranscriptTurns,
  extractYouTubeVideoId,
} from './services/embeddingService';
import {
  computeModelAgreement,
  computeMultiModelAgreement,
  computeSpeakerProfile,
  EvaluatedUtterance,
  formatTimestamp,
  SpeakerValueProfile,
} from './utils/schwartzMath';
import { RadarCircumplex, RadarPolygonLayer } from './components/RadarCircumplex';
import { YouTubePlayer } from './components/YouTubePlayer';

interface SavedVaultProfile {
  id: string;
  savedAt: string;
  videoTitle: string;
  videoId: string;
  speakerName: string;
  speakerRole: string;
  modelId: EmbeddingModelId;
  color: string;
  profile: SpeakerValueProfile;
}

const VAULT_STORAGE_KEY = 'valuelizer_history_vault_v1';

const VAULT_PALETTE = ['#06B6D4', '#F59E0B', '#EC4899', '#10B981', '#818CF8', '#F43F5E'];

export const MODEL_PALETTE: Record<
  EmbeddingModelId,
  { color: string; label: string; shortLabel: string; dashed: boolean; tag: string }
> = {
  'gemini-embedding-2': {
    color: '#06B6D4', // Cyan
    label: 'gemini-embedding-2',
    shortLabel: 'Gemini-2',
    dashed: false,
    tag: '3072D',
  },
  'gemini-embedding-001': {
    color: '#818CF8', // Indigo
    label: 'gemini-embedding-001',
    shortLabel: 'Gemini-001',
    dashed: false,
    tag: '768D',
  },
  'local-minilm': {
    color: '#EC4899', // Pink
    label: 'all-MiniLM-L6-v2',
    shortLabel: 'MiniLM',
    dashed: true,
    tag: '384D',
  },
  'openai-small': {
    color: '#10B981', // Emerald
    label: 'text-embedding-3-small',
    shortLabel: 'OpenAI-3',
    dashed: true,
    tag: '1536D',
  },
};

export default function App() {
  // Navigation & View Mode
  const [activeSection, setActiveSection] = useState<
    'workspace' | 'comparison' | 'vault' | 'methodology'
  >('workspace');

  // Active Debate & Search State
  const [activeDebate, setActiveDebate] = useState<PreIndexedDebate>(PRE_INDEXED_DEBATES[0]);
  const [searchInput, setSearchInput] = useState<string>(PRE_INDEXED_DEBATES[0].youtubeUrl);
  const [isIngestingVideo, setIsIngestingVideo] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Embedding Engine & Calibration Controls
  const [primaryModel, setPrimaryModel] = useState<EmbeddingModelId>('gemini-embedding-2');
  const [selectedCompareModels, setSelectedCompareModels] = useState<EmbeddingModelId[]>([
    'gemini-embedding-2',
    'local-minilm',
  ]);
  const [comparisonModel, setComparisonModel] = useState<EmbeddingModelId>('local-minilm');
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [thresholdTau, setThresholdTau] = useState<number>(0.08);
  const [useContextExpansion, setUseContextExpansion] = useState<boolean>(true);
  const [enableFlashLiteVerifier, setEnableFlashLiteVerifier] = useState<boolean>(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState<boolean>(false);
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<{
    geminiConfigured: boolean;
    openaiConfigured: boolean;
  }>({ geminiConfigured: true, openaiConfigured: false });
  const [cacheTelemetry, setCacheTelemetry] = useState<{
    fromCache: boolean;
    cachedAt?: string;
    hitCount?: number;
    latencyMs?: number;
  }>({ fromCache: false });
  const [globalCacheStats, setGlobalCacheStats] = useState<{
    debatesCached: number;
    evaluationsCached: number;
    embeddingsCached: number;
    totalCacheHits: number;
    recentDebates: Array<{
      videoId: string;
      title: string;
      channel: string;
      durationSeconds: number;
      speaker1Name: string;
      speaker1Role: string;
      speaker2Name: string;
      speaker2Role: string;
      turnsCount: number;
      cachedAt: string;
      hitCount: number;
    }>;
  }>({
    debatesCached: 3,
    evaluationsCached: 0,
    embeddingsCached: 0,
    totalCacheHits: 0,
    recentDebates: [],
  });

  // Playback & Preview Sum Overlay Mode
  const [showPreviewSum, setShowPreviewSum] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [seekRequest, setSeekRequest] = useState<{ timestamp: number; nonce: number } | null>(
    null
  );

  // Batch Progress & Evaluated Utterances
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
    status: string;
  }>({ completed: 0, total: 0, status: 'Ready' });
  const [engineSourceBadge, setEngineSourceBadge] = useState<string>('Calibrated Dual-Anchor');

  const [primaryUtterances, setPrimaryUtterances] = useState<EvaluatedUtterance[]>([]);
  const [comparisonUtterances, setComparisonUtterances] = useState<EvaluatedUtterance[]>([]);
  const [evaluatedUtterancesByModel, setEvaluatedUtterancesByModel] = useState<
    Partial<Record<EmbeddingModelId, EvaluatedUtterance[]>>
  >({});

  // Right Panel Visualization Controls
  const [speakerOverlayMode, setSpeakerOverlayMode] = useState<
    'both' | 'speaker_1' | 'speaker_2'
  >('both');
  const [compareSpeakerTarget, setCompareSpeakerTarget] = useState<'speaker_1' | 'speaker_2'>(
    'speaker_1'
  );
  const [selectedValueId, setSelectedValueId] = useState<SchwartzValueId | 'all'>('all');
  const [showScatterPoints, setShowScatterPoints] = useState<boolean>(true);
  const [showCentroidVectors, setShowCentroidVectors] = useState<boolean>(true);
  const [radarViewMode, setRadarViewMode] = useState<'overlapping' | 'side_by_side'>('overlapping');

  // History Vault State
  const [vaultProfiles, setVaultProfiles] = useState<SavedVaultProfile[]>([]);
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);
  const [justSavedToast, setJustSavedToast] = useState<boolean>(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState<boolean>(false);

  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const evalAbortRef = useRef<AbortController | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);

  const refreshGlobalCacheStats = useCallback(() => {
    fetch('/api/cache/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.debatesCached === 'number') {
          setGlobalCacheStats(data);
        }
      })
      .catch(() => {});
  }, []);

  // Check backend API & persistent cache status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setBackendStatus(data))
      .catch(() => {});
    refreshGlobalCacheStats();
  }, [refreshGlobalCacheStats]);

  // Run model evaluation whenever debate, models, or calibration changes
  const runEvaluationPipeline = useCallback(
    async (
      debate: PreIndexedDebate,
      modelA: EmbeddingModelId,
      compareModelsList: EmbeddingModelId[],
      compareActive: boolean,
      tau: number,
      contextExp: boolean,
      verifier: boolean,
      bypassCache = false
    ) => {
      if (evalAbortRef.current) {
        evalAbortRef.current.abort();
      }
      const controller = new AbortController();
      evalAbortRef.current = controller;

      setIsProcessingBatch(true);
      try {
        const resA = await evaluateTranscriptTurns(
          debate.turns,
          modelA,
          tau,
          contextExp,
          verifier,
          debate.speakers,
          (completed, total, status) => {
            if (!controller.signal.aborted) {
              setBatchProgress({ completed, total, status });
            }
          },
          {
            videoId: debate.videoId,
            bypassCache,
            signal: controller.signal,
            onPartialEvaluated: (partial) => {
              if (!controller.signal.aborted) {
                setPrimaryUtterances(partial);
                setEvaluatedUtterancesByModel((prev) => ({
                  ...prev,
                  [modelA]: partial,
                }));
              }
            },
          }
        );
        if (controller.signal.aborted) return;

        setPrimaryUtterances(resA.evaluated);
        setEvaluatedUtterancesByModel((prev) => ({
          ...prev,
          [modelA]: resA.evaluated,
        }));
        setCacheTelemetry({
          fromCache: Boolean(resA.fromCache),
          cachedAt: resA.cachedAt,
          hitCount: resA.hitCount,
          latencyMs: resA.latencyMs,
        });
        setEngineSourceBadge(
          resA.source === 'live-api'
            ? `${modelA} · Live Vector API`
            : resA.source === 'local-wasm'
            ? `${modelA} · In-Browser WASM`
            : `${modelA} · PVQ Subspace Engine`
        );

        if (compareActive) {
          const modelsToEval = compareModelsList.filter((m) => m !== modelA);
          for (const mId of modelsToEval) {
            if (controller.signal.aborted) break;
            setBatchProgress({
              completed: 0,
              total: debate.turns.length,
              status: `[Comparing] Evaluating ${mId}...`,
            });
            const resM = await evaluateTranscriptTurns(
              debate.turns,
              mId,
              tau,
              contextExp,
              false,
              debate.speakers,
              (completed, total, status) => {
                if (!controller.signal.aborted) {
                  setBatchProgress({ completed, total, status: `[${mId}] ${status}` });
                }
              },
              {
                videoId: debate.videoId,
                bypassCache,
                signal: controller.signal,
                onPartialEvaluated: (partial) => {
                  if (!controller.signal.aborted) {
                    setEvaluatedUtterancesByModel((prev) => ({
                      ...prev,
                      [mId]: partial,
                    }));
                  }
                },
              }
            );
            if (controller.signal.aborted) break;
            setEvaluatedUtterancesByModel((prev) => ({
              ...prev,
              [mId]: resM.evaluated,
            }));
            if (mId === compareModelsList[1] || mId === compareModelsList[0]) {
              setComparisonUtterances(resM.evaluated);
            }
          }
        }
        if (!controller.signal.aborted) {
          refreshGlobalCacheStats();
        }
      } finally {
        if (evalAbortRef.current === controller) {
          setIsProcessingBatch(false);
        }
      }
    },
    [refreshGlobalCacheStats]
  );

  // Active sentence evaluated at or near playhead position
  const activeUtterance = useMemo(() => {
    if (primaryUtterances.length === 0) return null;
    const current = primaryUtterances.find(
      (u) => currentTime >= u.timestamp && currentTime < u.endTime
    );
    if (current) return current;
    const past = primaryUtterances.filter((u) => u.timestamp <= currentTime);
    if (past.length > 0) return past[past.length - 1];
    return primaryUtterances[0];
  }, [primaryUtterances, currentTime]);

  useEffect(() => {
    runEvaluationPipeline(
      activeDebate,
      primaryModel,
      selectedCompareModels,
      isCompareMode || activeSection === 'comparison',
      thresholdTau,
      useContextExpansion,
      enableFlashLiteVerifier,
      false
    );
  }, [
    activeDebate,
    primaryModel,
    selectedCompareModels,
    isCompareMode,
    activeSection,
    thresholdTau,
    useContextExpansion,
    enableFlashLiteVerifier,
    runEvaluationPipeline,
  ]);

  // Load or seed History Vault in localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VAULT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedVaultProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVaultProfiles(parsed);
          setSelectedVaultIds(parsed.slice(0, 2).map((p) => p.id));
          return;
        }
      }
    } catch (_e) {
      // Ignore storage error
    }
  }, []);

  // Seed default vault profiles once primaryUtterances first populate if vault is empty
  useEffect(() => {
    if (vaultProfiles.length === 0 && primaryUtterances.length > 0) {
      const p1 = computeSpeakerProfile(
        primaryUtterances,
        'speaker_1',
        activeDebate.speakers.speaker_1.name,
        '#06B6D4'
      );
      const p2 = computeSpeakerProfile(
        primaryUtterances,
        'speaker_2',
        activeDebate.speakers.speaker_2.name,
        '#F59E0B'
      );
      const initialVault: SavedVaultProfile[] = [
        {
          id: 'seed-1',
          savedAt: '2026-10-20',
          videoTitle: activeDebate.title,
          videoId: activeDebate.videoId,
          speakerName: activeDebate.speakers.speaker_1.name,
          speakerRole: activeDebate.speakers.speaker_1.role,
          modelId: primaryModel,
          color: '#06B6D4',
          profile: p1,
        },
        {
          id: 'seed-2',
          savedAt: '2026-10-20',
          videoTitle: activeDebate.title,
          videoId: activeDebate.videoId,
          speakerName: activeDebate.speakers.speaker_2.name,
          speakerRole: activeDebate.speakers.speaker_2.role,
          modelId: primaryModel,
          color: '#F59E0B',
          profile: p2,
        },
      ];
      setVaultProfiles(initialVault);
      setSelectedVaultIds(['seed-1', 'seed-2']);
      try {
        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(initialVault));
      } catch (_e) {
        // Ignore
      }
    }
  }, [primaryUtterances, vaultProfiles.length, activeDebate, primaryModel]);

  // Present-moment timestamp cutoff is always synced to the active video playhead
  const effectiveCutoffTime = currentTime;

  // Compute real-time present-moment speaker profiles (up to currentTime) for Primary Model
  const speaker1Profile = useMemo(
    () =>
      computeSpeakerProfile(
        primaryUtterances,
        'speaker_1',
        activeDebate.speakers.speaker_1.name,
        activeDebate.speakers.speaker_1.color,
        effectiveCutoffTime
      ),
    [primaryUtterances, activeDebate, effectiveCutoffTime]
  );

  const speaker2Profile = useMemo(
    () =>
      computeSpeakerProfile(
        primaryUtterances,
        'speaker_2',
        activeDebate.speakers.speaker_2.name,
        activeDebate.speakers.speaker_2.color,
        effectiveCutoffTime
      ),
    [primaryUtterances, activeDebate, effectiveCutoffTime]
  );

  // Compute full-conversation cumulative sum profiles (upToTimestamp = undefined) for the background Preview Sum overlay
  const speaker1FinalProfile = useMemo(
    () =>
      computeSpeakerProfile(
        primaryUtterances,
        'speaker_1',
        activeDebate.speakers.speaker_1.name,
        activeDebate.speakers.speaker_1.color,
        undefined
      ),
    [primaryUtterances, activeDebate]
  );

  const speaker2FinalProfile = useMemo(
    () =>
      computeSpeakerProfile(
        primaryUtterances,
        'speaker_2',
        activeDebate.speakers.speaker_2.name,
        activeDebate.speakers.speaker_2.color,
        undefined
      ),
    [primaryUtterances, activeDebate]
  );

  // Compute multi-model profiles for all selected comparison models
  const multiModelProfiles = useMemo(() => {
    return selectedCompareModels.map((mId) => {
      const utts =
        evaluatedUtterancesByModel[mId] ||
        (mId === primaryModel ? primaryUtterances : comparisonUtterances);
      const meta = MODEL_PALETTE[mId];
      const modelName = EMBEDDING_MODELS.find((m) => m.id === mId)?.name || mId;
      return {
        modelId: mId,
        modelName,
        shortLabel: meta?.shortLabel || mId,
        color: meta?.color || '#06B6D4',
        dashed: meta?.dashed ?? false,
        tag: meta?.tag || '',
        profile: computeSpeakerProfile(
          utts.length > 0 ? utts : primaryUtterances,
          compareSpeakerTarget,
          `${activeDebate.speakers[compareSpeakerTarget].name} (${meta?.shortLabel || mId})`,
          meta?.color || '#06B6D4'
        ),
      };
    });
  }, [
    selectedCompareModels,
    evaluatedUtterancesByModel,
    primaryModel,
    primaryUtterances,
    comparisonUtterances,
    compareSpeakerTarget,
    activeDebate,
  ]);

  const multiModelAgreement = useMemo(
    () => computeMultiModelAgreement(multiModelProfiles),
    [multiModelProfiles]
  );

  const compareModelProfileA = multiModelProfiles[0]?.profile || speaker1Profile;
  const compareModelProfileB = multiModelProfiles[1]?.profile || speaker2Profile;
  const modelAgreement = useMemo(
    () => computeModelAgreement(compareModelProfileA, compareModelProfileB),
    [compareModelProfileA, compareModelProfileB]
  );

  // Determine active Radar Polygon layers based on view mode
  const activeRadarLayers: RadarPolygonLayer[] = useMemo(() => {
    if (isCompareMode || activeSection === 'comparison') {
      return multiModelProfiles.map((mp) => ({
        id: `compare-${mp.modelId}`,
        label: `${mp.shortLabel} (${mp.tag})`,
        sublabel: activeDebate.speakers[compareSpeakerTarget].name,
        color: mp.color,
        profile: mp.profile,
        dashed: mp.dashed,
      }));
    }

    if (activeSection === 'vault') {
      const selected = vaultProfiles.filter((vp) => selectedVaultIds.includes(vp.id));
      if (selected.length > 0) {
        return selected.map((vp, idx) => ({
          id: vp.id,
          label: vp.speakerName,
          sublabel: `${vp.modelId} · ${vp.savedAt}`,
          color: VAULT_PALETTE[idx % VAULT_PALETTE.length],
          profile: vp.profile,
          dashed: idx % 2 === 1,
        }));
      }
    }

    const layers: RadarPolygonLayer[] = [];

    // When Preview Sum is active, render faint dashed full-conversation cumulative polygons in the background first
    if (showPreviewSum) {
      if (speakerOverlayMode === 'both' || speakerOverlayMode === 'speaker_1') {
        layers.push({
          id: 'speaker_1_sum',
          label: `${activeDebate.speakers.speaker_1.name} (Preview Sum)`,
          sublabel: 'Final Cumulative Sum',
          color: '#06B6D4',
          profile: speaker1FinalProfile,
          dashed: true,
          isGhostSum: true,
        });
      }
      if (speakerOverlayMode === 'both' || speakerOverlayMode === 'speaker_2') {
        layers.push({
          id: 'speaker_2_sum',
          label: `${activeDebate.speakers.speaker_2.name} (Preview Sum)`,
          sublabel: 'Final Cumulative Sum',
          color: '#F59E0B',
          profile: speaker2FinalProfile,
          dashed: true,
          isGhostSum: true,
        });
      }
    }

    // Foreground present-moment polygons (synced to currentTime)
    if (speakerOverlayMode === 'both' || speakerOverlayMode === 'speaker_1') {
      layers.push({
        id: 'speaker_1',
        label: activeDebate.speakers.speaker_1.name,
        sublabel: activeDebate.speakers.speaker_1.role,
        color: '#06B6D4',
        profile: speaker1Profile,
      });
    }
    if (speakerOverlayMode === 'both' || speakerOverlayMode === 'speaker_2') {
      layers.push({
        id: 'speaker_2',
        label: activeDebate.speakers.speaker_2.name,
        sublabel: activeDebate.speakers.speaker_2.role,
        color: '#F59E0B',
        profile: speaker2Profile,
      });
    }
    return layers;
  }, [
    isCompareMode,
    activeSection,
    activeDebate,
    compareSpeakerTarget,
    multiModelProfiles,
    vaultProfiles,
    selectedVaultIds,
    speakerOverlayMode,
    showPreviewSum,
    speaker1Profile,
    speaker2Profile,
    speaker1FinalProfile,
    speaker2FinalProfile,
  ]);

  const foregroundRadarLayers = useMemo(
    () => activeRadarLayers.filter((l) => !l.isGhostSum),
    [activeRadarLayers]
  );

  // Global scale bound across all active layers so side-by-side radar maps share identical dimensions
  const globalScaleBound = useMemo(() => {
    let maxObs = 0.35;
    for (const layer of activeRadarLayers) {
      for (const val of layer.profile.ipsativeVector) {
        if (Math.abs(val) > maxObs) maxObs = Math.abs(val);
      }
    }
    return Math.max(0.32, Math.min(1.2, maxObs * 1.18));
  }, [activeRadarLayers]);

  // Handle YouTube URL or Keyword Search submission
  const handleSearchOrUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;
    setIngestError(null);

    // 1. Check if input matches any of the pre-indexed debates by videoId, URL, or keywords
    const extractedVideoId = extractYouTubeVideoId(query);
    const lowerQuery = query.toLowerCase().trim();

    let matchedPreset: PreIndexedDebate | undefined;
    if (extractedVideoId) {
      // If a YouTube video URL or ID was submitted, match strictly by video ID
      matchedPreset = PRE_INDEXED_DEBATES.find((d) => d.videoId === extractedVideoId);
    } else {
      matchedPreset = PRE_INDEXED_DEBATES.find(
        (d) =>
          d.title.toLowerCase().includes(lowerQuery) ||
          d.keywords.some(
            (k) =>
              k.toLowerCase() === lowerQuery ||
              (lowerQuery.includes(k.toLowerCase()) && k.length > 5)
          )
      );
    }

    if (matchedPreset) {
      setActiveDebate(matchedPreset);
      setCurrentTime(0);
      setSeekRequest({ timestamp: 0, nonce: Date.now() });
      setIsPlaying(false);
      return;
    }

    // 2. Otherwise, synthesize/ingest the requested YouTube URL or topic dynamically via backend Gemini API
    setIsIngestingVideo(true);
    try {
      const response = await fetch('/api/youtube-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryOrUrl: query,
          videoId: extractedVideoId || 'aircAruvnKk',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Could not ingest custom YouTube stream');
      }

      const data = await response.json();
      const customDebate: PreIndexedDebate = {
        id: `custom-${Date.now()}`,
        title: data.title || `YouTube Analysis: ${query}`,
        subtitle: `Diarized Conversation · ${data.speaker1Name} & ${data.speaker2Name}`,
        videoId: data.videoId || extractedVideoId || 'aircAruvnKk',
        youtubeUrl: extractedVideoId
          ? `https://www.youtube.com/watch?v=${extractedVideoId}`
          : query,
        channel: data.channel || 'YouTube Stream',
        durationSeconds: data.durationSeconds || 180,
        keywords: [query],
        speakers: {
          speaker_1: {
            id: 'speaker_1',
            name: data.speaker1Name || 'Speaker 1',
            role: data.speaker1Role || 'Primary Interlocutor',
            color: '#06B6D4',
          },
          speaker_2: {
            id: 'speaker_2',
            name: data.speaker2Name || 'Speaker 2',
            role: data.speaker2Role || 'Counter-Interlocutor',
            color: '#F59E0B',
          },
        },
        turns: (data.turns || []).map((t: any, idx: number) => {
          const start = typeof t.timestamp === 'number' && !isNaN(t.timestamp) ? Math.max(0, t.timestamp) : idx * 6;
          const end = typeof t.endTime === 'number' && !isNaN(t.endTime) ? Math.max(start + 1, t.endTime) : start + 6;
          return {
            id: `custom-t-${idx + 1}`,
            timestamp: Math.round(start),
            endTime: Math.round(end),
            speakerId: t.speakerId === 'speaker_2' ? 'speaker_2' : 'speaker_1',
            text: (t.text || '').trim(),
          };
        }).filter((t: any) => t.text.length > 0),
      };

      setActiveDebate(customDebate);
      setCurrentTime(0);
      setSeekRequest({ timestamp: 0, nonce: Date.now() });
      setIsPlaying(false);
      refreshGlobalCacheStats();
    } catch (err: any) {
      let msg = err?.message || 'Unable to load custom stream; loaded nearest benchmark debate.';
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message) {
          msg = parsed.error.message;
        }
      } catch (_e) {
        // Not JSON
      }
      setIngestError(msg);
    } finally {
      setIsIngestingVideo(false);
    }
  };

  const handleSelectPreIndexed = (debate: PreIndexedDebate) => {
    setIngestError(null);
    setActiveDebate(debate);
    setSearchInput(debate.youtubeUrl);
    setIsPlaying(false);
    setCurrentTime(0);
    setSeekRequest({ timestamp: 0, nonce: Date.now() });
  };

  const handleSelectCachedDebateById = async (videoId: string) => {
    const preset = PRE_INDEXED_DEBATES.find((d) => d.videoId === videoId);
    if (preset) {
      handleSelectPreIndexed(preset);
      return;
    }
    setIngestError(null);
    setIsIngestingVideo(true);
    try {
      const res = await fetch(`/api/cache/debate/${encodeURIComponent(videoId)}`);
      if (!res.ok) throw new Error('Could not load cached debate');
      const data = await res.json();
      const customDebate: PreIndexedDebate = {
        id: `cached-${data.videoId}`,
        title: data.title || `Cached Analysis: ${videoId}`,
        subtitle: `Diarized Conversation · ${data.speaker1Name} & ${data.speaker2Name}`,
        videoId: data.videoId,
        youtubeUrl: /^[a-zA-Z0-9_-]{11}$/.test(data.videoId)
          ? `https://www.youtube.com/watch?v=${data.videoId}`
          : data.title,
        channel: data.channel || 'YouTube Stream',
        durationSeconds: data.durationSeconds || 180,
        keywords: [data.title],
        speakers: {
          speaker_1: {
            id: 'speaker_1',
            name: data.speaker1Name || 'Speaker 1',
            role: data.speaker1Role || 'Primary Interlocutor',
            color: '#06B6D4',
          },
          speaker_2: {
            id: 'speaker_2',
            name: data.speaker2Name || 'Speaker 2',
            role: data.speaker2Role || 'Counter-Interlocutor',
            color: '#F59E0B',
          },
        },
        turns: (data.turns || []).map((t: any, idx: number) => ({
          id: t.id || `cached-t-${idx + 1}`,
          timestamp: Math.round(Number(t.timestamp) || idx * 6),
          endTime: Math.round(Number(t.endTime) || (idx + 1) * 6),
          speakerId: t.speakerId === 'speaker_2' ? 'speaker_2' : 'speaker_1',
          text: (t.text || '').trim(),
        })),
      };
      setActiveDebate(customDebate);
      setSearchInput(customDebate.youtubeUrl);
      setCurrentTime(0);
      setSeekRequest({ timestamp: 0, nonce: Date.now() });
      setIsPlaying(false);
    } catch (e: any) {
      setIngestError(e?.message || 'Failed to load cached conversation');
    } finally {
      setIsIngestingVideo(false);
    }
  };

  const handleConfirmReanalyze = async () => {
    setShowReanalyzeModal(false);
    setIsReanalyzing(true);
    setIsPlaying(false);
    setIngestError(null);
    clearClientEmbeddingCache();

    try {
      await fetch('/api/cache/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: activeDebate.videoId }),
      });

      const response = await fetch('/api/youtube-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryOrUrl: activeDebate.youtubeUrl || activeDebate.videoId,
          videoId: activeDebate.videoId,
          forceReanalyze: true,
        }),
      });

      let targetDebate = activeDebate;
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.turns) && data.turns.length > 0) {
          targetDebate = {
            ...activeDebate,
            title: data.title || activeDebate.title,
            channel: data.channel || activeDebate.channel,
            durationSeconds: data.durationSeconds || activeDebate.durationSeconds,
            speakers: {
              speaker_1: {
                ...activeDebate.speakers.speaker_1,
                name: data.speaker1Name || activeDebate.speakers.speaker_1.name,
                role: data.speaker1Role || activeDebate.speakers.speaker_1.role,
              },
              speaker_2: {
                ...activeDebate.speakers.speaker_2,
                name: data.speaker2Name || activeDebate.speakers.speaker_2.name,
                role: data.speaker2Role || activeDebate.speakers.speaker_2.role,
              },
            },
            turns: data.turns.map((t: any, idx: number) => ({
              id: t.id || `reanalyzed-t-${idx + 1}`,
              timestamp: Math.round(Number(t.timestamp) || idx * 6),
              endTime: Math.round(Number(t.endTime) || (idx + 1) * 6),
              speakerId: t.speakerId === 'speaker_2' ? 'speaker_2' : 'speaker_1',
              text: (t.text || '').trim(),
            })),
          };
          setActiveDebate(targetDebate);
        }
      }

      await runEvaluationPipeline(
        targetDebate,
        primaryModel,
        selectedCompareModels,
        isCompareMode || activeSection === 'comparison',
        thresholdTau,
        useContextExpansion,
        enableFlashLiteVerifier,
        true
      );
    } catch (err: any) {
      setIngestError(err?.message || 'Re-analysis encountered an error.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleSeekToTimestamp = (seconds: number, _utteranceId?: string) => {
    setSeekRequest({ timestamp: seconds, nonce: Date.now() });
    setCurrentTime(seconds);
  };

  const handleSaveCurrentToVault = () => {
    const nowStr = new Date().toISOString().slice(0, 10);
    const fullS1 = computeSpeakerProfile(
      primaryUtterances,
      'speaker_1',
      activeDebate.speakers.speaker_1.name,
      '#06B6D4'
    );
    const fullS2 = computeSpeakerProfile(
      primaryUtterances,
      'speaker_2',
      activeDebate.speakers.speaker_2.name,
      '#F59E0B'
    );

    const entry1: SavedVaultProfile = {
      id: `vault-${Date.now()}-s1`,
      savedAt: nowStr,
      videoTitle: activeDebate.title,
      videoId: activeDebate.videoId,
      speakerName: activeDebate.speakers.speaker_1.name,
      speakerRole: activeDebate.speakers.speaker_1.role,
      modelId: primaryModel,
      color: '#06B6D4',
      profile: fullS1,
    };

    const entry2: SavedVaultProfile = {
      id: `vault-${Date.now()}-s2`,
      savedAt: nowStr,
      videoTitle: activeDebate.title,
      videoId: activeDebate.videoId,
      speakerName: activeDebate.speakers.speaker_2.name,
      speakerRole: activeDebate.speakers.speaker_2.role,
      modelId: primaryModel,
      color: '#F59E0B',
      profile: fullS2,
    };

    const updated = [entry1, entry2, ...vaultProfiles];
    setVaultProfiles(updated);
    setSelectedVaultIds([entry1.id, entry2.id]);
    try {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
    } catch (_e) {
      // Ignore
    }
    setJustSavedToast(true);
    setTimeout(() => setJustSavedToast(false), 2200);
  };

  const handleDeleteVaultEntry = (id: string) => {
    const next = vaultProfiles.filter((v) => v.id !== id);
    setVaultProfiles(next);
    setSelectedVaultIds((prev) => prev.filter((item) => item !== id));
    try {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next));
    } catch (_e) {
      // Ignore
    }
  };

  const selectedValueAxis = useMemo(
    () =>
      SCHWARTZ_CIRCUMPLEX_AXES.find((a) => a.id === selectedValueId) ||
      SCHWARTZ_CIRCUMPLEX_AXES[0],
    [selectedValueId]
  );

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 1-row, 3-zone layout separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B0E17] border-b border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('workspace');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          Valuelizer
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('workspace');
              setIsCompareMode(false);
            }}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'workspace' && !isCompareMode
                ? 'text-cyan-400 underline underline-offset-8'
                : ''
            }`}
          >
            Circumplex Workspace
          </a>
          <a
            href="#comparison"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('comparison');
              setIsCompareMode(true);
            }}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'comparison' || isCompareMode
                ? 'text-cyan-400 underline underline-offset-8'
                : ''
            }`}
          >
            Model Comparison
          </a>
          <a
            href="#vault"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('vault');
              setIsCompareMode(false);
            }}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'vault' ? 'text-cyan-400 underline underline-offset-8' : ''
            }`}
          >
            History Vault ({vaultProfiles.length})
          </a>
          <a
            href="#methodology"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('methodology');
              setIsCompareMode(false);
            }}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'methodology' ? 'text-cyan-400 underline underline-offset-8' : ''
            }`}
          >
            Mathematical Spec
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setShowCalibrationModal(true)}
            className="px-4 py-2 text-xs font-medium text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Engine Calibration
          </button>
        </div>
      </header>

      {/* Secondary Scientific Ingestion & Multi-Model Switcher Toolbar */}
      <section className="bg-[#0B0E17]/70 border-b border-slate-800 px-3 sm:px-5 lg:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5">
          {/* Direct YouTube URL & Keyword Search Input (Expanded, High-Visibility Layout) */}
          <form onSubmit={handleSearchOrUrlSubmit} className="flex-1 flex items-center gap-2 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Paste YouTube URL (https://www.youtube.com/watch?v=...) or search debate keywords..."
                title={searchInput || 'YouTube URL or search query'}
                className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-[#07090E] border border-slate-700 hover:border-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:outline-none rounded text-xs md:text-sm text-slate-100 font-mono placeholder:text-slate-500 transition-all shadow-inner tracking-tight"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-mono p-0.5 cursor-pointer"
                  title="Clear input"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isIngestingVideo}
              className="px-3.5 py-1.5 sm:py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isIngestingVideo ? 'Ingesting Stream...' : 'Load Stream'}
            </button>
          </form>

          {/* Right Toolbar Cluster: Benchmarks & Model Selector (Wraps cleanly on narrow desktop screens) */}
          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2 shrink-0">
            {/* Pre-Indexed Benchmark Debates Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <span className="text-[11px] font-mono text-slate-400 mr-0.5 whitespace-nowrap shrink-0">
                Benchmarks:
              </span>
              {PRE_INDEXED_DEBATES.map((debate, index) => {
                const isSelected = activeDebate.id === debate.id;
                const shortNames = [
                  '01. Free Will',
                  '02. Sowell',
                  '03. Altman & Fridman',
                ];
                return (
                  <button
                    key={debate.id}
                    type="button"
                    onClick={() => handleSelectPreIndexed(debate)}
                    title={debate.title}
                    className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                      isSelected
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50 font-medium'
                        : 'bg-[#07090E] text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {shortNames[index] || debate.title}
                  </button>
                );
              })}
            </div>

            {/* Model Selector Dropdown & Quick Compare Toggle */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 bg-[#07090E] border border-slate-800 rounded px-2 py-1 sm:px-2.5 sm:py-1.5 shrink-0">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <label htmlFor="model-select" className="sr-only">
                  Active Embedding Model
                </label>
                <select
                  id="model-select"
                  value={primaryModel}
                  onChange={(e) => setPrimaryModel(e.target.value as EmbeddingModelId)}
                  className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer"
                >
                  {EMBEDDING_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0B0E17] text-slate-100">
                      {m.name} ({m.dimensions}D)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextMode = !(isCompareMode || activeSection === 'comparison');
                  setIsCompareMode(nextMode);
                  setActiveSection(nextMode ? 'comparison' : 'workspace');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-medium rounded border transition-all cursor-pointer shrink-0 ${
                  isCompareMode || activeSection === 'comparison'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-xs font-semibold'
                    : 'bg-[#07090E] text-slate-300 border-slate-800 hover:text-slate-100 hover:border-slate-700'
                }`}
                title="Toggle Cross-Model Comparison Mode (2, 3, or 4 models)"
              >
                <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
                <span>Compare Models</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    selectedCompareModels.length > 2
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {selectedCompareModels.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {ingestError && (
          <div className="max-w-[1440px] mx-auto mt-2 text-xs font-mono text-amber-400">
            ▲ {ingestError}
          </div>
        )}
      </section>

      {/* Main Split-Screen Scientific Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5">
        {activeSection === 'methodology' ? (
          /* Mathematical & Psychometric Specification View */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6 bg-[#111827] border border-slate-800 rounded-md p-6">
              <div>
                <h1 className="text-xl font-bold text-slate-100">
                  01. Dual-Anchor Embedding Polarity & Ipsative Circumplex Mathematics
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Zero-LLM cost real-time value polarity scoring grounded in Shalom H. Schwartz’s
                  Portrait Values Questionnaire (PVQ).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div className="bg-[#07090E] border border-slate-800 rounded p-4 space-y-2">
                  <div className="text-xs font-mono text-cyan-400">
                    STEP 1 · CONTEXT WINDOW EXPANSION
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Every conversational turn <code className="text-slate-100">u_i</code> is
                    prepended with the immediately preceding speaker turn to preserve conversational
                    targets of agreement or rebuttal:
                  </p>
                  <pre className="text-[11px] font-mono bg-[#0B0E17] p-2.5 rounded border border-slate-800 text-slate-200 overflow-x-auto">
                    {`Input = 'Previous: "' + Turn_{i-1} + '" | Current: "' + Turn_i + '"'`}
                  </pre>
                </div>

                <div className="bg-[#07090E] border border-slate-800 rounded p-4 space-y-2">
                  <div className="text-xs font-mono text-amber-400">
                    STEP 2 · DUAL-ANCHOR POLARITY DIFFERENTIAL
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Instead of single-vector similarity (which conflates endorsement and rejection),
                    we compute differential cosine similarity against positive{' '}
                    <code className="text-emerald-400">c_k^+</code> and negative{' '}
                    <code className="text-rose-400">c_k^-</code> PVQ anchors:
                  </p>
                  <pre className="text-[11px] font-mono bg-[#0B0E17] p-2.5 rounded border border-slate-800 text-slate-200 overflow-x-auto">
                    {`Δ_{k,i} = cos(u_i, c_k^+) - cos(u_i, c_k^-)  (Threshold |Δ| ≥ τ = ${thresholdTau})`}
                  </pre>
                </div>
              </div>

              <div className="bg-[#07090E] border border-slate-800 rounded p-4 space-y-2">
                <div className="text-xs font-mono text-emerald-400">
                  STEP 3 · IPSATIVE (CENTERED) RADAR PROJECTION
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  To measure relative value hierarchy rather than raw talkativeness, each speaker’s
                  cumulative score <code className="text-slate-100">S_k = Σ_i Δ_&#123;k,i&#125;</code> is
                  centered by subtracting their personal mean across all 10 values{' '}
                  <code className="text-slate-100">S̄ = (1/10) Σ S_k</code>, yielding{' '}
                  <code className="text-cyan-400">I_k = S_k - S̄</code>.
                </p>
              </div>

              {/* Complete 10-Value Dual-Anchor Dictionary Table */}
              <div className="space-y-3 pt-2">
                <h2 className="text-sm font-semibold text-slate-200">
                  02. Canonical Dual-Anchor PVQ Reference Dictionary (10 Schwartz Axes)
                </h2>
                <div className="overflow-x-auto border border-slate-800 rounded">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#07090E] border-b border-slate-800 font-mono text-slate-400">
                        <th className="py-2.5 px-3">Value & Angle</th>
                        <th className="py-2.5 px-3">Positive Anchor (c_k^+)</th>
                        <th className="py-2.5 px-3">Negative Anchor (c_k^-)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => (
                        <tr key={axis.id} className="hover:bg-slate-900/50">
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap align-top">
                            <span className="font-semibold text-slate-100">{axis.name}</span>
                            <div className="text-slate-400 text-[11px] tabular-nums">
                              {axis.angleDeg}° · {axis.domain.replace(/_/g, ' ')}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-emerald-300/90 align-top">
                            "{axis.positiveAnchor}"
                          </td>
                          <td className="py-2.5 px-3 text-rose-300/90 align-top">
                            "{axis.negativeAnchor}"
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-[#111827] border border-slate-800 rounded-md p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-100">
                  03. Multi-Model Embedding Architecture
                </h2>
                <div className="space-y-3">
                  {EMBEDDING_MODELS.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-[#07090E] border border-slate-800 rounded space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-cyan-400 font-semibold">{m.name}</span>
                        <span className="text-slate-400 tabular-nums">{m.dimensions} dims</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{m.executionMode}</div>
                      <p className="text-xs text-slate-300 pt-1">{m.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Primary Split-Screen Dashboard (Left: Video & Diarized Transcript | Right: Circumplex & Analytics — Side-by-Side on narrow desktop md+, Vertical on mobile) */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 lg:gap-5 items-start">
            {/* LEFT PANEL (5 cols on narrow desktop md/lg, 4 cols on xl): Video Playback & Synchronized Diarized Transcript */}
            <div className="md:col-span-5 lg:col-span-5 xl:col-span-4 flex flex-col gap-3.5">
              {/* Stream Header (Clean Title, Re-analyze & Debug actions) */}
              <div className="bg-[#111827] border border-slate-800 rounded-md p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-base font-bold text-slate-100 leading-snug min-w-0 flex-1">
                    {activeDebate.title}
                  </h1>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowReanalyzeModal(true)}
                      disabled={isReanalyzing || isProcessingBatch || isIngestingVideo}
                      title="Invalidate cached transcript & vector evaluations for this conversation and run a fresh analysis"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#07090E] hover:bg-slate-900 text-slate-300 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/50 rounded text-xs font-mono transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 text-cyan-400 ${isReanalyzing ? 'animate-spin' : ''}`} />
                      <span>{isReanalyzing ? 'Re-analyzing...' : 'Re-analyze'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDebugPanel((prev) => !prev)}
                      className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                        showDebugPanel
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                          : 'bg-[#07090E] hover:bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                      title="Toggle stream & engine diagnostics"
                      aria-expanded={showDebugPanel}
                    >
                      <Bug className="w-3 h-3 text-cyan-400" />
                      <span>Debug</span>
                    </button>
                  </div>
                </div>

                {/* Unique Diagnostics & Telemetry Info (Toggled via Debug button below Re-analyze) */}
                {showDebugPanel && (
                  <div className="p-2.5 bg-[#07090E] border border-slate-800 rounded text-[11px] font-mono space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-1">
                      <span className="font-semibold text-cyan-400 uppercase tracking-wider text-[10px]">
                        Stream & Engine Diagnostics
                      </span>
                      <span className="text-slate-500 text-[10px]">ID: {activeDebate.videoId}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-300">
                      <div>
                        <span className="text-slate-500">Channel: </span>
                        <span>{activeDebate.channel}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Engine: </span>
                        <span>{engineSourceBadge}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Cache Status: </span>
                        <span className={cacheTelemetry.fromCache ? 'text-emerald-400' : 'text-cyan-400'}>
                          {cacheTelemetry.fromCache ? 'Shared Disk Hit' : 'Persisted'} ({cacheTelemetry.latencyMs || 1} ms)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Session Reuse: </span>
                        <span>{cacheTelemetry.hitCount || 1}×</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Total Indexed: </span>
                        <span>{globalCacheStats.debatesCached} conversations</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Global Hits: </span>
                        <span>{globalCacheStats.totalCacheHits}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Sentence Processing Counter (Live Playback Sync element removed per user request) */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-400">
                  <span>τ = {thresholdTau.toFixed(2)}</span>
                  <span>
                    {primaryUtterances.filter((u) => u.timestamp <= effectiveCutoffTime).length}/
                    {primaryUtterances.length || activeDebate.turns.length} sentences active
                  </span>
                </div>

                {/* Batch Processing Progress Bar */}
                {isProcessingBatch && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] font-mono text-cyan-400">
                      <span>{batchProgress.status}</span>
                      <span className="tabular-nums">
                        {batchProgress.completed}/{batchProgress.total}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#07090E] rounded overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-150"
                        style={{
                          width: `${
                            batchProgress.total > 0
                              ? Math.round((batchProgress.completed / batchProgress.total) * 100)
                              : 50
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Embedded YouTube Player + Synchronized Scrubber */}
              <YouTubePlayer
                videoId={activeDebate.videoId}
                durationSeconds={activeDebate.durationSeconds}
                turns={primaryUtterances.length > 0 ? primaryUtterances : activeDebate.turns}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onTimeUpdate={setCurrentTime}
                onPlayStateChange={setIsPlaying}
                seekRequest={seekRequest}
              />

              {/* Active Sentence Processing HUD (Shows exact sentence from transcript currently evaluated) */}
              {activeUtterance && (
                <div className="bg-[#111827] border border-cyan-500/50 rounded-md p-4 space-y-3 shadow-xl ring-1 ring-cyan-500/20">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-cyan-400 font-semibold uppercase tracking-wider">
                        Active Sentence #{activeUtterance.sentenceIndex} of {primaryUtterances.length}
                      </span>
                    </div>
                    <span className="text-slate-400 tabular-nums">
                      @{formatTimestamp(activeUtterance.timestamp)} – {formatTimestamp(activeUtterance.endTime)}
                    </span>
                  </div>

                  {/* Identified Speaker */}
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold ${
                        activeUtterance.speakerId === 'speaker_1'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {activeUtterance.speakerId === 'speaker_1' ? 'S1' : 'S2'}
                    </span>
                    <div>
                      <span
                        className={`text-sm font-bold ${
                          activeUtterance.speakerId === 'speaker_1'
                            ? 'text-cyan-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {activeUtterance.speakerName}
                      </span>
                      <span className="text-xs text-slate-400 ml-2 font-mono">
                        ({activeUtterance.speakerRole})
                      </span>
                    </div>
                  </div>

                  {/* Exact Sentence Processed From Transcript */}
                  <div className="p-3 bg-[#07090E] border border-slate-800 rounded">
                    <div className="text-[10px] font-mono text-cyan-400 mb-1 uppercase tracking-wide">
                      Exact Sentence From Transcript Processed:
                    </div>
                    <p className="text-sm font-medium text-slate-100 leading-relaxed">
                      "{activeUtterance.text}"
                    </p>
                  </div>

                  {/* Context Window Expansion & Polarity Differential */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="p-2 bg-[#07090E] border border-slate-800/80 rounded">
                      <span className="text-slate-400 block mb-0.5">Context Window Expansion:</span>
                      <span className="text-slate-300 line-clamp-2">
                        {activeUtterance.contextExpandedInput}
                      </span>
                    </div>
                    <div className="p-2 bg-[#07090E] border border-slate-800/80 rounded">
                      <span className="text-slate-400 block mb-0.5">Detected Schwartz Polarity:</span>
                      {activeUtterance.dominantBadges.length === 0 ? (
                        <span className="text-slate-500 italic">Within neutral boundary (|Δ| &lt; {thresholdTau.toFixed(2)})</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {activeUtterance.dominantBadges.map((b) => (
                            <span
                              key={b.valueId}
                              className={b.polarity === '+' ? 'text-emerald-400' : 'text-rose-400'}
                            >
                              {b.polarity}{b.name} ({b.delta >= 0 ? '+' : ''}{b.delta.toFixed(3)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Synchronized Diarized Sentence-by-Sentence Feed */}
              {/* Diarized Sentence Stream (Collapsed by default below active sentence) */}
              <div className="bg-[#111827] border border-slate-800 rounded-md flex flex-col overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsTranscriptExpanded((prev) => !prev)}
                  className="w-full px-4 py-3 bg-[#111827] hover:bg-slate-800/80 border-b border-slate-800/80 flex items-center justify-between text-left transition-colors cursor-pointer"
                  aria-expanded={isTranscriptExpanded}
                >
                  <div className="flex items-center gap-2">
                    {isTranscriptExpanded ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-200">
                      Transcript Cards ({primaryUtterances.length} sentences)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      [{isTranscriptExpanded ? 'Click to collapse' : 'Collapsed · Click to expand'}]
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-cyan-400">
                      ■ {activeDebate.speakers.speaker_1.name.split(' ').pop()}
                    </span>
                    <span className="text-amber-400">
                      ■ {activeDebate.speakers.speaker_2.name.split(' ').pop()}
                    </span>
                  </div>
                </button>

                {isTranscriptExpanded && (
                  <div
                    ref={transcriptContainerRef}
                    className="max-h-[460px] overflow-y-auto divide-y divide-slate-800/80 transition-all"
                  >
                    {primaryUtterances.map((utt) => {
                      const isCurrentSentence =
                        currentTime >= utt.timestamp && currentTime < utt.endTime;
                      const isFutureInSync = utt.timestamp > currentTime;

                      return (
                        <div
                          key={utt.id}
                          onClick={() => handleSeekToTimestamp(utt.timestamp, utt.id)}
                          className={`p-3 transition-colors cursor-pointer ${
                            isCurrentSentence
                              ? 'bg-slate-800/85 ring-1 ring-inset ring-cyan-500/50'
                              : isFutureInSync
                              ? 'opacity-40 hover:opacity-80 bg-[#0B0E17]/40'
                              : 'hover:bg-slate-900/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500 tabular-nums font-semibold">
                                #{utt.sentenceIndex}
                              </span>
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-mono font-bold ${
                                  utt.speakerId === 'speaker_1'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {utt.speakerId === 'speaker_1' ? 'S1' : 'S2'}
                              </span>
                              <span
                                className={`text-xs font-semibold ${
                                  utt.speakerId === 'speaker_1' ? 'text-cyan-300' : 'text-amber-300'
                                }`}
                              >
                                {utt.speakerName}
                              </span>
                              <span className="text-xs text-slate-500">·</span>
                              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                {formatTimestamp(utt.timestamp)} – {formatTimestamp(utt.endTime)}
                              </span>
                            </div>

                            {isCurrentSentence && (
                              <span className="text-[10px] font-mono text-cyan-400">
                                ● ACTIVE SENTENCE
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-200 leading-relaxed font-normal">
                            "{utt.text}"
                          </p>

                          {/* Detected Schwartz Value Polarity Badges */}
                          {utt.dominantBadges.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono">
                              {utt.dominantBadges.map((b) => (
                                <button
                                  key={b.valueId}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedValueId(b.valueId);
                                  }}
                                  className={`hover:underline cursor-pointer tabular-nums ${
                                    b.polarity === '+' ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {b.polarity}
                                  {b.name} ({b.delta >= 0 ? '+' : ''}
                                  {b.delta.toFixed(3)})
                                </button>
                              ))}
                            </div>
                          )}

                          {utt.verifierAudit && (
                            <div className="mt-1.5 text-[11px] font-mono text-slate-400">
                              Flash-Lite Audit: {utt.verifierAudit.rationale}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL (7 cols on narrow desktop md/lg, 8 cols on xl): Schwartz Radar Circumplex & Value Inspector */}
            <div className="md:col-span-7 lg:col-span-7 xl:col-span-8 flex flex-col gap-3.5">
              {/* Circumplex Graph & Value Inspector Window (Stacked inside right pane on narrow desktop so all elements fit; side-by-side on wide xl+ desktop) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                {/* Circumplex Graph Card (Full width of right pane on md/lg; 8 of 12 cols on xl+) */}
                <div className="xl:col-span-8 2xl:col-span-9 bg-[#111827] border border-slate-800 rounded-md p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                    <div>
                      <div className="text-[11px] font-mono text-slate-400">
                        10-AXIS IPSATIVE CIRCUMPLEX · I_k = S_k - S̄
                      </div>
                      <h2 className="text-sm font-bold text-slate-100 mt-0.5">
                        {isCompareMode || activeSection === 'comparison'
                          ? `Cross-Model Comparison (${selectedCompareModels.map((m) => MODEL_PALETTE[m]?.shortLabel || m).join(' vs. ')})`
                          : activeSection === 'vault'
                          ? 'History Vault Circumplex Overlay'
                          : 'Real-Time Motivational Continuum'}
                      </h2>
                    </div>

                    {/* Controls: Speaker Selection, Preview Sum Toggle, Save & Radar View Mode */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Speaker Selector (Visible in Real-time workspace mode) */}
                      {!(isCompareMode || activeSection === 'comparison') &&
                        activeSection !== 'vault' && (
                          <div className="flex items-center gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded text-xs">
                            <button
                              type="button"
                              onClick={() => setSpeakerOverlayMode('both')}
                              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                speakerOverlayMode === 'both'
                                  ? 'bg-slate-800 text-slate-100'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Both
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpeakerOverlayMode('speaker_1')}
                              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                speakerOverlayMode === 'speaker_1'
                                  ? 'bg-cyan-500/20 text-cyan-300'
                                  : 'text-slate-400 hover:text-cyan-300'
                              }`}
                            >
                              {activeDebate.speakers.speaker_1.name.split(' ').pop()}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpeakerOverlayMode('speaker_2')}
                              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                speakerOverlayMode === 'speaker_2'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'text-slate-400 hover:text-amber-300'
                              }`}
                            >
                              {activeDebate.speakers.speaker_2.name.split(' ').pop()}
                            </button>
                          </div>
                        )}

                      {/* Preview Sum Toggle (Displays faint dashed final cumulative radar map in background) */}
                      {!(isCompareMode || activeSection === 'comparison') &&
                        activeSection !== 'vault' && (
                          <button
                            type="button"
                            onClick={() => setShowPreviewSum((prev) => !prev)}
                            aria-pressed={showPreviewSum}
                            title={
                              showPreviewSum
                                ? 'Preview Sum enabled: Showing faint dashed final cumulative radar map behind present-moment map'
                                : 'Preview Sum disabled: Showing present-moment radar map only'
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              showPreviewSum
                                ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-xs'
                                : 'bg-[#07090E] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <CircleDotDashed className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Preview Sum</span>
                            {isProcessingBatch && showPreviewSum && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"
                                title="Progressively evaluating conversation in rate-limit safe chunks..."
                              />
                            )}
                          </button>
                        )}

                      {/* Save to History Vault Button */}
                      <button
                        type="button"
                        onClick={handleSaveCurrentToVault}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#07090E] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="Save active profiles to history vault"
                      >
                        {justSavedToast ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 text-[11px]">Saved</span>
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-[11px]">Save</span>
                          </>
                        )}
                      </button>

                      {/* Radar Map Display Toggle: Icon-Only Overlapping (Layers) vs. Side-by-Side (Columns) */}
                      <div className="flex items-center gap-0.5 p-0.5 bg-[#07090E] border border-slate-800 rounded">
                        <button
                          type="button"
                          onClick={() => setRadarViewMode('overlapping')}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            radarViewMode === 'overlapping'
                              ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Overlapping view (default): Overlay active profiles on a single radar chart"
                          aria-label="Overlapping view"
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRadarViewMode('side_by_side');
                            if (
                              !(isCompareMode || activeSection === 'comparison') &&
                              activeSection !== 'vault'
                            ) {
                              setSpeakerOverlayMode('both');
                            }
                          }}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            radarViewMode === 'side_by_side'
                              ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Side-by-Side view: Display active profiles in separate side-by-side radar charts"
                          aria-label="Side-by-Side view"
                        >
                          <Columns className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Model Comparison Secondary Bar when Compare Mode is active */}
                  {(isCompareMode || activeSection === 'comparison') && (
                    <div className="my-2 p-2.5 bg-[#07090E] border border-slate-800 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                      {/* Left: Target Speaker & Multi-Model Toggles */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Target Speaker Selector */}
                        <div className="flex items-center gap-1 bg-[#111827] border border-slate-800 rounded p-0.5">
                          <span className="text-[10px] font-mono text-slate-400 px-1">Target:</span>
                          <button
                            type="button"
                            onClick={() => setCompareSpeakerTarget('speaker_1')}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                              compareSpeakerTarget === 'speaker_1'
                                ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {activeDebate.speakers.speaker_1.name.split(' ').pop()}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompareSpeakerTarget('speaker_2')}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                              compareSpeakerTarget === 'speaker_2'
                                ? 'bg-amber-500/20 text-amber-300 font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {activeDebate.speakers.speaker_2.name.split(' ').pop()}
                          </button>
                        </div>

                        {/* Multi-Model Toggle Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {EMBEDDING_MODELS.map((m) => {
                            const isSelected = selectedCompareModels.includes(m.id);
                            const palette = MODEL_PALETTE[m.id];
                            return (
                              <button
                                key={`compare-toggle-${m.id}`}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    if (selectedCompareModels.length <= 2) return;
                                    setSelectedCompareModels((prev) => prev.filter((id) => id !== m.id));
                                  } else {
                                    setSelectedCompareModels((prev) => [...prev, m.id]);
                                  }
                                }}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#111827] border-slate-600 text-slate-100 shadow-xs font-semibold'
                                    : 'bg-[#07090E] border-slate-800/80 text-slate-400 hover:text-slate-200'
                                }`}
                                title={
                                  isSelected && selectedCompareModels.length <= 2
                                    ? 'Minimum 2 models required for comparison'
                                    : `Toggle ${m.name}`
                                }
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: palette?.color || '#06B6D4',
                                    opacity: isSelected ? 1 : 0.35,
                                  }}
                                />
                                <span>{palette?.shortLabel || m.name}</span>
                                <span className="text-[9px] text-slate-400 font-normal">({palette?.tag})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Mean Inter-Model Agreement Metric */}
                      <div className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                        Mean Agreement:{' '}
                        <span className="text-emerald-400 font-bold">
                          {(multiModelAgreement.meanPairwiseCosine * 100).toFixed(1)}%
                        </span>{' '}
                        <span className="text-[10px] text-slate-400">
                          ({selectedCompareModels.length} models)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Interactive SVG Radar Circumplex (Overlapping Default vs. Side-by-Side Mode) */}
                  {radarViewMode === 'overlapping' ? (
                    <div className="py-1 flex justify-center">
                      <RadarCircumplex
                        layers={activeRadarLayers}
                        utterances={primaryUtterances}
                        selectedValueId={selectedValueId}
                        onSelectValue={setSelectedValueId}
                        onSeekToTimestamp={handleSeekToTimestamp}
                        showScatterPoints={showScatterPoints}
                        showCentroidVectors={showCentroidVectors}
                        upToTimestamp={effectiveCutoffTime}
                      />
                    </div>
                  ) : (
                    <div
                      className={`grid gap-3 py-1 ${
                        foregroundRadarLayers.length >= 2
                          ? 'grid-cols-1 sm:grid-cols-2'
                          : 'grid-cols-1'
                      }`}
                    >
                      {foregroundRadarLayers.map((layer) => {
                        const ghostLayer = activeRadarLayers.find(
                          (g) => g.isGhostSum && g.id === `${layer.id}_sum`
                        );
                        return (
                          <div
                            key={`side-by-side-${layer.id}`}
                            className="bg-[#07090E] border border-slate-800/90 rounded-md p-2.5 flex flex-col items-center space-y-1.5"
                          >
                            <div className="w-full flex items-center justify-between text-xs px-1 border-b border-slate-800/80 pb-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: layer.color }}
                                />
                                <span className="font-semibold text-slate-100 truncate text-xs">
                                  {layer.label}
                                </span>
                              </div>
                              <div className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                                <span className="text-cyan-400 font-semibold">
                                  θ={layer.profile.centroid.angleDeg.toFixed(0)}°
                                </span>{' '}
                                · r={layer.profile.centroid.magnitude.toFixed(2)}
                              </div>
                            </div>
                            <RadarCircumplex
                              layers={ghostLayer ? [ghostLayer, layer] : [layer]}
                              utterances={primaryUtterances}
                              selectedValueId={selectedValueId}
                              onSelectValue={setSelectedValueId}
                              onSeekToTimestamp={handleSeekToTimestamp}
                              showScatterPoints={showScatterPoints}
                              showCentroidVectors={showCentroidVectors}
                              upToTimestamp={effectiveCutoffTime}
                              className="max-w-[340px]"
                              fixedScaleBound={globalScaleBound}
                              isCompact={true}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Circumplex Layer Legend & Net Motivational Centroid Vector Summary */}
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {foregroundRadarLayers.map((layer) => (
                          <div key={layer.id} className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-xs inline-block"
                              style={{ backgroundColor: layer.color }}
                            />
                            <span className="font-semibold text-slate-200 text-xs">{layer.label}</span>
                            <span className="text-slate-500 font-mono text-[10px] tabular-nums">
                              (S̄={layer.profile.personalMean >= 0 ? '+' : ''}
                              {layer.profile.personalMean.toFixed(2)})
                            </span>
                          </div>
                        ))}
                        {!(isCompareMode || activeSection === 'comparison') &&
                          activeSection !== 'vault' &&
                          showPreviewSum && (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                              <span className="w-3.5 border-t border-dashed border-cyan-400/70 inline-block" />
                              <span>Dashed = Preview Sum (Final)</span>
                            </div>
                          )}
                      </div>

                      {/* Visual Layer Toggles */}
                      <div className="flex items-center gap-2.5 text-[11px] font-mono">
                        <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showScatterPoints}
                            onChange={(e) => setShowScatterPoints(e.target.checked)}
                            className="accent-cyan-400 rounded"
                          />
                          <span>Scatter</span>
                        </label>
                        <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showCentroidVectors}
                            onChange={(e) => setShowCentroidVectors(e.target.checked)}
                            className="accent-cyan-400 rounded"
                          />
                          <span>Centroid</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Value Inspector Card (Full width below graph on narrow desktop md/lg; 4 cols on xl, 3 cols on 2xl) */}
                <div className="xl:col-span-4 2xl:col-span-3 bg-[#111827] border border-slate-800 rounded-md p-3 space-y-2.5 xl:sticky xl:top-4">
                  <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 min-w-0">
                      <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate uppercase font-semibold tracking-wide text-slate-200">
                        Value Inspector
                      </span>
                    </div>

                    {/* Quick Axis Switcher: Full-width All Dimensions button + 2-column grid for the 10 Schwartz values */}
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setSelectedValueId('all')}
                        className={`w-full py-1.5 text-[11px] font-mono rounded transition-colors cursor-pointer font-bold ${
                          selectedValueId === 'all'
                            ? 'bg-cyan-500 text-slate-950 shadow-xs'
                            : 'bg-[#07090E] text-slate-300 hover:text-slate-100 hover:bg-slate-800/80 border border-slate-800'
                        }`}
                      >
                        All Dimensions
                      </button>
                      <div className="grid grid-cols-2 gap-1.5">
                        {SCHWARTZ_CIRCUMPLEX_AXES.map((ax) => (
                          <button
                            key={ax.id}
                            type="button"
                            title={ax.domain.replace(/_/g, ' ')}
                            onClick={() => setSelectedValueId(ax.id)}
                            className={`px-2.5 py-1.5 text-center text-[11px] font-mono rounded transition-colors cursor-pointer truncate font-medium ${
                              selectedValueId === ax.id
                                ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                                : 'bg-[#07090E] text-slate-300 hover:text-slate-100 hover:bg-slate-800/80 border border-slate-800'
                            }`}
                          >
                            {ax.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* View Content: Ultra-Compact Multi-Dimensional Bipolar Report for ALL vs. Single Value Axis Deep-Dive */}
                  {selectedValueId === 'all' ? (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {foregroundRadarLayers.map((layer) => {
                        const { centroid } = layer.profile;
                        const xVal = centroid.opennessVsConservation;
                        const yVal = centroid.transcendenceVsEnhancement;
                        const xPercent = Math.min(100, Math.max(0, ((xVal + 1) / 2) * 100));
                        const yPercent = Math.min(100, Math.max(0, ((yVal + 1) / 2) * 100));

                        return (
                          <div
                            key={`bipolar-inspector-${layer.id}`}
                            className="p-2.5 bg-[#07090E] border border-slate-800/90 rounded space-y-2"
                          >
                            {/* Compact Speaker/Model & Vector Polarity Header */}
                            <div className="flex items-center justify-between text-xs border-b border-slate-800/70 pb-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: layer.color }}
                                />
                                <span className="font-semibold text-slate-100 truncate text-[11px]">
                                  {layer.label}
                                </span>
                              </div>
                              <div className="font-mono text-[10px] tabular-nums text-slate-300 shrink-0">
                                <span className="text-cyan-400 font-semibold">θ={centroid.angleDeg.toFixed(0)}°</span>
                                <span className="text-slate-600 mx-1">·</span>
                                <span className="text-slate-400">r={centroid.magnitude.toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Dimension 1: Openness vs Conservation */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-slate-400">Openness / Conserv</span>
                                <span
                                  className={`font-semibold tabular-nums ${
                                    xVal >= 0 ? 'text-cyan-300' : 'text-amber-300'
                                  }`}
                                >
                                  {xVal >= 0 ? '+' : ''}{xVal.toFixed(2)}
                                </span>
                              </div>
                              <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="absolute top-0 bottom-0 w-2 bg-cyan-400 rounded-full -translate-x-1/2 shadow-xs"
                                  style={{ left: `${xPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[8px] font-mono text-slate-500">
                                <span>Conserv</span>
                                <span className={xVal >= 0 ? 'text-cyan-400 font-medium' : 'text-amber-400 font-medium'}>
                                  {xVal >= 0 ? 'Openness' : 'Conserv.'}
                                </span>
                                <span>Openness</span>
                              </div>
                            </div>

                            {/* Dimension 2: Self-Transcendence vs Self-Enhancement */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-slate-400">Transcend / Enhance</span>
                                <span
                                  className={`font-semibold tabular-nums ${
                                    yVal >= 0 ? 'text-emerald-300' : 'text-rose-300'
                                  }`}
                                >
                                  {yVal >= 0 ? '+' : ''}{yVal.toFixed(2)}
                                </span>
                              </div>
                              <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="absolute top-0 bottom-0 w-2 bg-emerald-400 rounded-full -translate-x-1/2 shadow-xs"
                                  style={{ left: `${yPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[8px] font-mono text-slate-500">
                                <span>Enhance</span>
                                <span className={yVal >= 0 ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                                  {yVal >= 0 ? 'Transcend.' : 'Enhance.'}
                                </span>
                                <span>Transcend</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800/50">
                              <span>S̄: {layer.profile.personalMean >= 0 ? '+' : ''}{layer.profile.personalMean.toFixed(2)}</span>
                              <span className="text-slate-400">Click pill for quotes</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Single Value Axis Drilldown (Vertical Sidebar & Scrollable) */
                    <div className="max-h-[480px] overflow-y-auto space-y-2.5 pr-1">
                      {(isCompareMode || activeSection === 'comparison'
                        ? multiModelProfiles.map((mp) => mp.profile)
                        : [speaker1Profile, speaker2Profile]
                      ).map((sp) => {
                        const axisScore = sp.scores[selectedValueId];
                        if (!axisScore) return null;
                        return (
                          <div
                            key={sp.speakerId}
                            className="p-2.5 bg-[#07090E] border border-slate-800 rounded space-y-2"
                          >
                            <div className="flex flex-col gap-1 border-b border-slate-800 pb-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold truncate" style={{ color: sp.color }}>
                                  {sp.speakerName}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  Raw S: <strong className="text-slate-200">{axisScore.rawCumulativeScore >= 0 ? '+' : ''}{axisScore.rawCumulativeScore.toFixed(2)}</strong>
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-slate-400">Ipsative I:</span>
                                <strong className={axisScore.ipsativeScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {axisScore.ipsativeScore >= 0 ? '+' : ''}{axisScore.ipsativeScore.toFixed(2)}
                                </strong>
                              </div>
                            </div>

                            {/* Endorsing Quotes */}
                            <div className="space-y-1">
                              <div className="text-[10px] font-mono text-emerald-400">
                                Endorsing (+Δ, n={axisScore.endorsementCount})
                              </div>
                              {axisScore.topEndorsingQuotes.length === 0 ? (
                                <p className="text-[11px] text-slate-500 italic">No +τ utterances yet.</p>
                              ) : (
                                axisScore.topEndorsingQuotes.slice(0, 2).map((q) => (
                                  <div
                                    key={q.utteranceId}
                                    onClick={() => handleSeekToTimestamp(q.timestamp, q.utteranceId)}
                                    className="p-1.5 bg-[#111827] hover:bg-slate-800/80 border border-slate-800 rounded text-xs cursor-pointer transition-colors"
                                  >
                                    <div className="flex justify-between font-mono text-[9px] text-emerald-400 mb-0.5 tabular-nums">
                                      <span>#{q.sentenceIndex} (@{formatTimestamp(q.timestamp)})</span>
                                      <span>Δ = +{q.delta.toFixed(3)}</span>
                                    </div>
                                    <p className="text-slate-200 line-clamp-2 text-[11px]">"{q.text}"</p>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Opposing Quotes */}
                            {axisScore.topOpposingQuotes.length > 0 && (
                              <div className="space-y-1 pt-0.5">
                                <div className="text-[10px] font-mono text-rose-400">
                                  Opposing (-Δ, n={axisScore.rejectionCount})
                                </div>
                                {axisScore.topOpposingQuotes.slice(0, 2).map((q) => (
                                  <div
                                    key={q.utteranceId}
                                    onClick={() => handleSeekToTimestamp(q.timestamp, q.utteranceId)}
                                    className="p-1.5 bg-[#111827] hover:bg-slate-800/80 border border-slate-800 rounded text-xs cursor-pointer transition-colors"
                                  >
                                    <div className="flex justify-between font-mono text-[9px] text-rose-400 mb-0.5 tabular-nums">
                                      <span>#{q.sentenceIndex} (@{formatTimestamp(q.timestamp)})</span>
                                      <span>Δ = {q.delta.toFixed(3)}</span>
                                    </div>
                                    <p className="text-slate-200 line-clamp-2 text-[11px]">"{q.text}"</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Conditional Sub-Panels: Multi-Model Divergence & Consensus Matrix OR History Vault */}
              {(isCompareMode || activeSection === 'comparison') && (
                <div className="bg-[#111827] border border-slate-800 rounded-md p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                    <div>
                      <div className="text-[11px] font-mono text-cyan-400 font-semibold uppercase tracking-wider">
                        Cross-Model Consensus Matrix ({selectedCompareModels.length} Models)
                      </div>
                      <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                        {activeDebate.speakers[compareSpeakerTarget].name} ·{' '}
                        <span className="font-normal text-slate-400">
                          {selectedCompareModels.map((m) => MODEL_PALETTE[m]?.shortLabel || m).join(' vs. ')}
                        </span>
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-slate-400">
                      <span>
                        Mean Agreement:{' '}
                        <strong className="text-emerald-400">
                          {(multiModelAgreement.meanPairwiseCosine * 100).toFixed(1)}%
                        </strong>
                      </span>
                      <span className="text-slate-600">·</span>
                      <span>
                        Mean Spread:{' '}
                        <strong className="text-cyan-400">
                          {multiModelAgreement.meanSpread.toFixed(3)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Pairwise Inter-Model Agreement Correlations (When comparing 3 or 4 models) */}
                  {selectedCompareModels.length >= 3 && multiModelAgreement.pairwiseAgreements.length > 0 && (
                    <div className="p-2.5 bg-[#07090E] border border-slate-800 rounded space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span className="uppercase tracking-wider font-semibold">
                          Pairwise Correlation Matrix ({multiModelAgreement.pairwiseAgreements.length} Pairs)
                        </span>
                        <span className="text-slate-500">10D Profile Cosine Similarity</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                        {multiModelAgreement.pairwiseAgreements.map((pair, idx) => {
                          const palA = MODEL_PALETTE[pair.modelA as EmbeddingModelId];
                          const palB = MODEL_PALETTE[pair.modelB as EmbeddingModelId];
                          return (
                            <div
                              key={`pair-${idx}`}
                              className="p-1.5 bg-[#111827] border border-slate-800 rounded flex items-center justify-between gap-1 text-[11px] font-mono"
                            >
                              <div className="flex items-center gap-1 min-w-0 truncate">
                                <span style={{ color: palA?.color || '#06B6D4' }} className="font-semibold">
                                  {palA?.shortLabel || pair.modelA}
                                </span>
                                <span className="text-slate-500">↔</span>
                                <span style={{ color: palB?.color || '#EC4899' }} className="font-semibold">
                                  {palB?.shortLabel || pair.modelB}
                                </span>
                              </div>
                              <span
                                className={`font-bold tabular-nums shrink-0 ${
                                  pair.cosine >= 0.95
                                    ? 'text-emerald-400'
                                    : pair.cosine >= 0.85
                                    ? 'text-cyan-400'
                                    : 'text-amber-400'
                                }`}
                              >
                                {(pair.cosine * 100).toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Multi-Model Divergence Table (Supports 2, 3, or all 4 models) */}
                  <div className="overflow-x-auto border border-slate-800 rounded">
                    <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="bg-[#07090E] border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 px-3 whitespace-nowrap font-sans font-semibold">
                            Schwartz Value
                          </th>
                          {selectedCompareModels.map((mId) => {
                            const pal = MODEL_PALETTE[mId];
                            return (
                              <th
                                key={`col-${mId}`}
                                className="py-2.5 px-3 text-right whitespace-nowrap"
                                style={{ color: pal?.color || '#06B6D4' }}
                              >
                                {pal?.shortLabel || mId}{' '}
                                <span className="text-[10px] opacity-70">({pal?.tag})</span>
                              </th>
                            );
                          })}
                          <th className="py-2.5 px-3 text-right whitespace-nowrap text-slate-300">
                            Spread (Δ)
                          </th>
                          <th className="py-2.5 px-3 text-center whitespace-nowrap text-slate-400">
                            Consensus
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {multiModelAgreement.divergences.map((row) => {
                          const isHighSpread = row.spread >= 0.45;
                          const isMediumSpread = row.spread >= 0.22 && row.spread < 0.45;

                          return (
                            <tr
                              key={row.valueId}
                              onClick={() => setSelectedValueId(row.valueId)}
                              className={`hover:bg-slate-900/60 cursor-pointer transition-colors ${
                                selectedValueId === row.valueId ? 'bg-slate-800/60 ring-1 ring-inset ring-cyan-500/40' : ''
                              }`}
                              title={`Click to inspect ${row.name} in Value Inspector`}
                            >
                              <td className="py-2.5 px-3 font-sans font-medium text-slate-200 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span>{row.name}</span>
                                  {selectedValueId === row.valueId && (
                                    <span className="text-[9px] font-mono text-cyan-400 font-bold">●</span>
                                  )}
                                </div>
                              </td>

                              {selectedCompareModels.map((mId) => {
                                const score = row.scoresByModel[mId];
                                return (
                                  <td
                                    key={`score-${row.valueId}-${mId}`}
                                    className="py-2.5 px-3 text-right whitespace-nowrap font-semibold"
                                  >
                                    {score !== undefined ? (
                                      <span
                                        className={
                                          score >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                        }
                                      >
                                        {score >= 0 ? '+' : ''}
                                        {score.toFixed(3)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="py-2.5 px-3 text-right text-slate-300 font-bold whitespace-nowrap">
                                {row.spread.toFixed(3)}
                              </td>

                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {isHighSpread ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                    High Spread
                                  </span>
                                ) : isMediumSpread ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    Moderate
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    High Consensus
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === 'vault' && (
                <div className="bg-[#111827] border border-slate-800 rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        History Vault — Saved Speaker Value Profiles
                      </h3>
                      <p className="text-xs text-slate-400">
                        Multi-select any saved profiles below to overlay and compare thinkers across
                        videos or embedding models on the Circumplex above.
                      </p>
                    </div>
                  </div>

                  {vaultProfiles.length === 0 ? (
                    <div className="p-6 text-center bg-[#07090E] border border-slate-800 rounded space-y-2">
                      <History className="w-6 h-6 text-slate-500 mx-auto" />
                      <p className="text-xs text-slate-400">
                        No speaker profiles saved in localStorage yet.
                      </p>
                      <button
                        type="button"
                        onClick={handleSaveCurrentToVault}
                        className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-medium text-xs rounded cursor-pointer"
                      >
                        Save Active Debate Profiles
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded bg-[#07090E]">
                      {vaultProfiles.map((vp) => {
                        const isChecked = selectedVaultIds.includes(vp.id);
                        return (
                          <div
                            key={vp.id}
                            className="p-3 flex items-center justify-between gap-3 hover:bg-slate-900/50"
                          >
                            <label className="flex items-center gap-3 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedVaultIds((prev) =>
                                    prev.includes(vp.id)
                                      ? prev.filter((id) => id !== vp.id)
                                      : [...prev, vp.id]
                                  );
                                }}
                                className="accent-cyan-400 rounded"
                              />
                              <div>
                                <div className="text-xs font-semibold text-slate-100">
                                  {vp.speakerName}{' '}
                                  <span className="font-normal text-slate-400">
                                    · {vp.speakerRole}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                  {vp.videoTitle} · Model: {vp.modelId} · {vp.savedAt}
                                </div>
                              </div>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleDeleteVaultEntry(vp.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Remove from Vault"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Engine Calibration & Multi-Provider Settings Modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-md max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-bold text-slate-100">
                  Psychometric Engine & Provider Calibration
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCalibrationModal(false)}
                className="text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                [ESC / CLOSE]
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Polarity Threshold Tau Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono">
                  <label htmlFor="tau-slider" className="text-slate-200 font-semibold">
                    Polarity Differential Threshold (τ)
                  </label>
                  <span className="text-cyan-400 tabular-nums">{thresholdTau.toFixed(2)}</span>
                </div>
                <input
                  id="tau-slider"
                  type="range"
                  min={0.02}
                  max={0.22}
                  step={0.01}
                  value={thresholdTau}
                  onChange={(e) => setThresholdTau(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <p className="text-slate-400">
                  Utterances with |cos(u, c_k^+) - cos(u, c_k^-)| &lt; τ are filtered as neutral
                  noise (default τ = 0.08).
                </p>
              </div>

              {/* Context Window Expansion Toggle */}
              <label className="flex items-start gap-2.5 p-3 bg-[#07090E] border border-slate-800 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={useContextExpansion}
                  onChange={(e) => setUseContextExpansion(e.target.checked)}
                  className="mt-0.5 accent-cyan-400"
                />
                <div>
                  <div className="font-semibold text-slate-200">
                    Context Window Expansion (Previous Turn Prepending)
                  </div>
                  <p className="text-slate-400 mt-0.5">
                    Prepends Turn_&#123;i-1&#125; to Turn_i before embedding so short rebuttals retain
                    semantic polarity.
                  </p>
                </div>
              </label>

              {/* Flash-Lite Hybrid Verifier Toggle */}
              <label className="flex items-start gap-2.5 p-3 bg-[#07090E] border border-slate-800 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableFlashLiteVerifier}
                  onChange={(e) => setEnableFlashLiteVerifier(e.target.checked)}
                  className="mt-0.5 accent-cyan-400"
                />
                <div>
                  <div className="font-semibold text-slate-200">
                    Flash-Lite Hybrid Polarity Verifier (gemini-3.1-flash-lite)
                  </div>
                  <p className="text-slate-400 mt-0.5">
                    Audits speaker turn boundaries and attaches psychometric rationales to
                    high-conflict utterances via server-side Gemini Flash-Lite.
                  </p>
                </div>
              </label>

              {/* Server-Side Credentials Status */}
              <div className="p-3 bg-[#07090E] border border-slate-800 rounded space-y-1.5 font-mono">
                <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <CircleDotDashed className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Provider Telemetry & Environment Secrets</span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-1">
                  <div>
                    Google Gemini API:{' '}
                    <span
                      className={
                        backendStatus.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {backendStatus.geminiConfigured
                        ? '● Connected via Server Environment'
                        : '▲ Using Calibrated Local PVQ Subspace'}
                    </span>
                  </div>
                  <div>
                    Local WASM (@xenova/transformers):{' '}
                    <span className="text-emerald-400">● Ready (Zero API Key Required)</span>
                  </div>
                  <div>
                    OpenAI Embeddings:{' '}
                    <span
                      className={
                        backendStatus.openaiConfigured ? 'text-emerald-400' : 'text-slate-400'
                      }
                    >
                      {backendStatus.openaiConfigured
                        ? '● Connected via Server Environment'
                        : 'Configure OPENAI_API_KEY in AI Studio Settings > Secrets'}
                    </span>
                  </div>
                  <div>
                    Shared Persistent Disk Cache:{' '}
                    <span className="text-emerald-400 tabular-nums">
                      ● Active ({globalCacheStats.debatesCached} debates ·{' '}
                      {globalCacheStats.evaluationsCached} model evaluations ·{' '}
                      {globalCacheStats.embeddingsCached} vectors)
                    </span>
                  </div>
                </div>
              </div>

              {globalCacheStats.recentDebates.length > 0 && (
                <div className="p-3 bg-[#07090E] border border-slate-800 rounded space-y-2">
                  <div className="text-slate-300 font-semibold font-mono text-[11px] flex items-center justify-between">
                    <span>Cached Conversations Available Globally</span>
                    <span className="text-slate-400 tabular-nums">
                      {globalCacheStats.totalCacheHits} total hits
                    </span>
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-slate-800/70">
                    {globalCacheStats.recentDebates.map((item) => (
                      <div
                        key={item.videoId}
                        className="py-1.5 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="truncate text-slate-300">
                          <span className="font-semibold">{item.title}</span>{' '}
                          <span className="text-slate-500 font-mono">
                            · {item.turnsCount} turns · {item.hitCount}× hits
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCalibrationModal(false);
                            handleSelectCachedDebateById(item.videoId);
                          }}
                          className="text-cyan-400 hover:text-cyan-300 font-mono whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Load
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setThresholdTau(0.08);
                  setUseContextExpansion(true);
                  setEnableFlashLiteVerifier(false);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
              >
                Reset Defaults
              </button>
              <button
                type="button"
                onClick={() => setShowCalibrationModal(false)}
                className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold rounded text-xs cursor-pointer"
              >
                Apply Calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User-Confirmed Re-Analyze Conversation Modal */}
      {showReanalyzeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-md max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-slate-100">
                  Confirm Conversation Re-analysis
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowReanalyzeModal(false)}
                className="text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                [ESC]
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                This conversation (<span className="font-semibold text-slate-100">{activeDebate.title}</span>) is
                stored in the shared persistent disk cache so no user has to re-process it.
              </p>
              <div className="p-3 bg-[#07090E] border border-slate-800 rounded space-y-1.5 font-mono text-[11px] text-slate-400">
                <div className="text-slate-200 font-semibold">
                  Actions performed upon confirmation:
                </div>
                <div>1. Invalidate cached transcript &amp; speaker diarization (ID: {activeDebate.videoId})</div>
                <div>2. Re-fetch captions and re-compute Schwartz PVQ vector deltas</div>
                <div>3. Update shared persistent disk cache for all future sessions</div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowReanalyzeModal(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium cursor-pointer"
              >
                Keep Cached Analysis
              </button>
              <button
                type="button"
                onClick={handleConfirmReanalyze}
                className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded text-xs cursor-pointer"
              >
                Confirm &amp; Re-analyze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
