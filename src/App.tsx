import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookmarkPlus,
  Check,
  Compass,
  Cpu,
  GitCompare,
  History,
  Play,
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
  EMBEDDING_MODELS,
  EmbeddingModelId,
  evaluateTranscriptTurns,
  extractYouTubeVideoId,
} from './services/embeddingService';
import {
  computeModelAgreement,
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
  const [comparisonModel, setComparisonModel] = useState<EmbeddingModelId>('local-minilm');
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [thresholdTau, setThresholdTau] = useState<number>(0.08);
  const [useContextExpansion, setUseContextExpansion] = useState<boolean>(true);
  const [enableFlashLiteVerifier, setEnableFlashLiteVerifier] = useState<boolean>(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<{
    geminiConfigured: boolean;
    openaiConfigured: boolean;
  }>({ geminiConfigured: true, openaiConfigured: false });

  // Playback & Execution Mode
  const [executionMode, setExecutionMode] = useState<'sync' | 'batch'>('sync');
  const [currentTime, setCurrentTime] = useState<number>(85);
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

  // Right Panel Visualization Controls
  const [speakerOverlayMode, setSpeakerOverlayMode] = useState<
    'both' | 'speaker_1' | 'speaker_2'
  >('both');
  const [compareSpeakerTarget, setCompareSpeakerTarget] = useState<'speaker_1' | 'speaker_2'>(
    'speaker_1'
  );
  const [selectedValueId, setSelectedValueId] = useState<SchwartzValueId>(
    SchwartzValueId.SECURITY
  );
  const [showScatterPoints, setShowScatterPoints] = useState<boolean>(true);
  const [showCentroidVectors, setShowCentroidVectors] = useState<boolean>(true);

  // History Vault State
  const [vaultProfiles, setVaultProfiles] = useState<SavedVaultProfile[]>([]);
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);
  const [justSavedToast, setJustSavedToast] = useState<boolean>(false);

  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Check backend API status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setBackendStatus(data))
      .catch(() => {});
  }, []);

  // Run primary model evaluation whenever debate, model, or calibration changes
  const runEvaluationPipeline = useCallback(
    async (
      debate: PreIndexedDebate,
      modelA: EmbeddingModelId,
      modelB: EmbeddingModelId,
      compareActive: boolean,
      tau: number,
      contextExp: boolean,
      verifier: boolean
    ) => {
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
            setBatchProgress({ completed, total, status });
          }
        );
        setPrimaryUtterances(resA.evaluated);
        setEngineSourceBadge(
          resA.source === 'live-api'
            ? `${modelA} · Live Vector API`
            : resA.source === 'local-wasm'
            ? `${modelA} · In-Browser WASM`
            : `${modelA} · PVQ Subspace Engine`
        );

        if (compareActive) {
          const resB = await evaluateTranscriptTurns(
            debate.turns,
            modelB,
            tau,
            contextExp,
            false,
            debate.speakers,
            (completed, total, status) => {
              setBatchProgress({ completed, total, status: `[Compare] ${status}` });
            }
          );
          setComparisonUtterances(resB.evaluated);
        }
      } finally {
        setIsProcessingBatch(false);
      }
    },
    []
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
      comparisonModel,
      isCompareMode || activeSection === 'comparison',
      thresholdTau,
      useContextExpansion,
      enableFlashLiteVerifier
    );
  }, [
    activeDebate,
    primaryModel,
    comparisonModel,
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

  // Effective timestamp cutoff: in 'sync' mode, only utterances up to currentTime are included;
  // in 'batch' mode, if the user scrubs the playhead, they can also see the state at currentTime
  const effectiveCutoffTime =
    executionMode === 'sync' ? currentTime : currentTime < activeDebate.durationSeconds ? currentTime : undefined;

  // Compute real-time speaker profiles for Primary Model
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

  // Compute speaker profiles for Comparison Model (Model B)
  const compareModelProfileA = useMemo(
    () =>
      computeSpeakerProfile(
        primaryUtterances,
        compareSpeakerTarget,
        `${activeDebate.speakers[compareSpeakerTarget].name} (${primaryModel})`,
        '#06B6D4'
      ),
    [primaryUtterances, compareSpeakerTarget, activeDebate, primaryModel]
  );

  const compareModelProfileB = useMemo(
    () =>
      computeSpeakerProfile(
        comparisonUtterances.length > 0 ? comparisonUtterances : primaryUtterances,
        compareSpeakerTarget,
        `${activeDebate.speakers[compareSpeakerTarget].name} (${comparisonModel})`,
        '#EC4899'
      ),
    [comparisonUtterances, primaryUtterances, compareSpeakerTarget, activeDebate, comparisonModel]
  );

  const modelAgreement = useMemo(
    () => computeModelAgreement(compareModelProfileA, compareModelProfileB),
    [compareModelProfileA, compareModelProfileB]
  );

  // Determine active Radar Polygon layers based on view mode
  const activeRadarLayers: RadarPolygonLayer[] = useMemo(() => {
    if (isCompareMode || activeSection === 'comparison') {
      return [
        {
          id: 'model-a',
          label: `Model A · ${primaryModel}`,
          sublabel: activeDebate.speakers[compareSpeakerTarget].name,
          color: '#06B6D4', // Cyan
          profile: compareModelProfileA,
        },
        {
          id: 'model-b',
          label: `Model B · ${comparisonModel}`,
          sublabel: activeDebate.speakers[compareSpeakerTarget].name,
          color: '#EC4899', // Magenta
          profile: compareModelProfileB,
          dashed: true,
        },
      ];
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
    primaryModel,
    comparisonModel,
    activeDebate,
    compareSpeakerTarget,
    compareModelProfileA,
    compareModelProfileB,
    vaultProfiles,
    selectedVaultIds,
    speakerOverlayMode,
    speaker1Profile,
    speaker2Profile,
  ]);

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
      if (executionMode === 'batch') {
        setCurrentTime(matchedPreset.durationSeconds);
      } else {
        setCurrentTime(75);
      }
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
        turns: (data.turns || []).map((t: any, idx: number) => ({
          id: `custom-t-${idx + 1}`,
          timestamp: Number(t.timestamp) || idx * 14,
          endTime: Number(t.endTime) || (idx + 1) * 14,
          speakerId: t.speakerId === 'speaker_2' ? 'speaker_2' : 'speaker_1',
          text: t.text,
        })),
      };

      setActiveDebate(customDebate);
      setCurrentTime(customDebate.durationSeconds);
      setIsPlaying(false);
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
    if (executionMode === 'batch') {
      setCurrentTime(debate.durationSeconds);
    } else {
      setCurrentTime(85);
    }
  };

  const handleProcessAllFastBatch = async () => {
    setIsPlaying(false);
    setExecutionMode('batch');
    setCurrentTime(activeDebate.durationSeconds);
    await runEvaluationPipeline(
      activeDebate,
      primaryModel,
      comparisonModel,
      isCompareMode || activeSection === 'comparison',
      thresholdTau,
      useContextExpansion,
      enableFlashLiteVerifier
    );
  };

  const handleSeekToTimestamp = (seconds: number, _utteranceId?: string) => {
    setSeekRequest({ timestamp: seconds, nonce: Date.now() });
    if (executionMode === 'sync' && seconds > currentTime) {
      setCurrentTime(seconds);
    }
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
      <section className="bg-[#0B0E17]/70 border-b border-slate-800 px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Direct YouTube URL & Keyword Search Input */}
          <form onSubmit={handleSearchOrUrlSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Paste YouTube URL (https://www.youtube.com/watch?v=...) or search debate keywords..."
                className="w-full pl-9 pr-3 py-1.5 bg-[#07090E] border border-slate-700 focus:border-cyan-400 focus:outline-none rounded text-xs text-slate-100 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isIngestingVideo}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isIngestingVideo ? 'Ingesting Stream...' : 'Load Stream'}
            </button>
          </form>

          {/* Pre-Indexed Benchmark Debates Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-[11px] font-mono text-slate-400 mr-1 whitespace-nowrap shrink-0">
              Benchmarks:
            </span>
            {PRE_INDEXED_DEBATES.map((debate, index) => {
              const isSelected = activeDebate.id === debate.id;
              const shortNames = [
                '01. StarTalk: Free Will (Tyson & Liu)',
                '02. Wealth, Poverty & Politics (Sowell)',
                '03. Altman & Fridman AGI Scaling',
              ];
              return (
                <button
                  key={debate.id}
                  type="button"
                  onClick={() => handleSelectPreIndexed(debate)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
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

          {/* Model Selector Dropdown & Compare Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-[#07090E] border border-slate-800 rounded px-2.5 py-1">
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
                const next = !isCompareMode;
                setIsCompareMode(next);
                if (next) setActiveSection('comparison');
                else if (activeSection === 'comparison') setActiveSection('workspace');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isCompareMode
                  ? 'bg-pink-500/20 text-pink-300 border-pink-500/50'
                  : 'bg-[#07090E] text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare Models</span>
            </button>
          </div>
        </div>

        {ingestError && (
          <div className="max-w-[1440px] mx-auto mt-2 text-xs font-mono text-amber-400">
            ▲ {ingestError}
          </div>
        )}
      </section>

      {/* Main Split-Screen Scientific Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5">
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
          /* Primary Split-Screen Dashboard (Left: Video & Diarized Transcript | Right: Circumplex & Analytics) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT PANEL (5 columns on 12-col grid): Video Playback & Synchronized Diarized Transcript */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Stream Header & Execution Mode Bar */}
              <div className="bg-[#111827] border border-slate-800 rounded-md p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-400 font-mono">
                      {activeDebate.channel} · ID: {activeDebate.videoId} · {engineSourceBadge}
                    </div>
                    <h1 className="text-base font-bold text-slate-100 leading-snug mt-0.5">
                      {activeDebate.title}
                    </h1>
                  </div>
                </div>

                {/* Execution Mode Toggle: Sync to Playback vs. Process All (One-Tap Fast Batch) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded">
                    <button
                      type="button"
                      onClick={() => {
                        setExecutionMode('sync');
                        if (currentTime >= activeDebate.durationSeconds) {
                          setCurrentTime(55);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        executionMode === 'sync'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span>Sync to Playback</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleProcessAllFastBatch}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        executionMode === 'batch'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      <span>Process All (Fast Batch)</span>
                    </button>
                  </div>

                  <div className="text-xs font-mono tabular-nums text-slate-400">
                    τ = {thresholdTau.toFixed(2)} ·{' '}
                    {
                      primaryUtterances.filter(
                        (u) =>
                          effectiveCutoffTime === undefined || u.timestamp <= effectiveCutoffTime
                      ).length
                    }
                    /{primaryUtterances.length || activeDebate.turns.length} sentences active
                  </div>
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
              <div className="bg-[#111827] border border-slate-800 rounded-md flex flex-col">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-200">
                    Diarized Sentence Stream ({primaryUtterances.length} sentences)
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-cyan-400">
                      ■ {activeDebate.speakers.speaker_1.name}
                    </span>
                    <span className="text-amber-400">
                      ■ {activeDebate.speakers.speaker_2.name}
                    </span>
                  </div>
                </div>

                <div
                  ref={transcriptContainerRef}
                  className="max-h-[460px] overflow-y-auto divide-y divide-slate-800/80"
                >
                  {primaryUtterances.map((utt) => {
                    const isCurrentSentence =
                      currentTime >= utt.timestamp && currentTime < utt.endTime;
                    const isFutureInSync =
                      executionMode === 'sync' && utt.timestamp > currentTime;

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
              </div>
            </div>

            {/* RIGHT PANEL (7 columns on 12-col grid): Schwartz Radar Circumplex, Value Inspector, Model Comparison & Vault */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              {/* Top Circumplex Controls & Speaker / Comparison Header */}
              <div className="bg-[#111827] border border-slate-800 rounded-md p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="text-xs font-mono text-slate-400">
                      10-AXIS IPSATIVE CIRCUMPLEX · I_k = S_k - S̄
                    </div>
                    <h2 className="text-base font-bold text-slate-100 mt-0.5">
                      {isCompareMode || activeSection === 'comparison'
                        ? `Multi-Model Architecture Comparison: ${primaryModel} vs. ${comparisonModel}`
                        : activeSection === 'vault'
                        ? 'Historical Vault Multi-Profile Circumplex Overlay'
                        : 'Real-Time Schwartz Motivational Continuum'}
                    </h2>
                  </div>

                  {/* Speaker Selection & Save to Vault Controls */}
                  <div className="flex items-center gap-2">
                    {!(isCompareMode || activeSection === 'comparison') &&
                      activeSection !== 'vault' && (
                        <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded">
                          <button
                            type="button"
                            onClick={() => setSpeakerOverlayMode('both')}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              speakerOverlayMode === 'both'
                                ? 'bg-slate-800 text-slate-100'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Overlay Both
                          </button>
                          <button
                            type="button"
                            onClick={() => setSpeakerOverlayMode('speaker_1')}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              speakerOverlayMode === 'speaker_2'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'text-slate-400 hover:text-amber-300'
                            }`}
                          >
                            {activeDebate.speakers.speaker_2.name.split(' ').pop()}
                          </button>
                        </div>
                      )}

                    <button
                      type="button"
                      onClick={handleSaveCurrentToVault}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#07090E] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {justSavedToast ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Saved to Vault</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Save Profiles</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Model Comparison Secondary Bar when Compare Mode is active */}
                {(isCompareMode || activeSection === 'comparison') && (
                  <div className="my-3 p-3 bg-[#07090E] border border-slate-800 rounded flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-cyan-400 font-semibold">Model A:</span>
                        <select
                          value={primaryModel}
                          onChange={(e) => setPrimaryModel(e.target.value as EmbeddingModelId)}
                          className="bg-[#111827] border border-slate-700 rounded px-2 py-1 text-slate-100"
                        >
                          {EMBEDDING_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-pink-400 font-semibold">Model B:</span>
                        <select
                          value={comparisonModel}
                          onChange={(e) => setComparisonModel(e.target.value as EmbeddingModelId)}
                          className="bg-[#111827] border border-slate-700 rounded px-2 py-1 text-slate-100"
                        >
                          {EMBEDDING_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-slate-400">Subject:</span>
                        <select
                          value={compareSpeakerTarget}
                          onChange={(e) =>
                            setCompareSpeakerTarget(e.target.value as 'speaker_1' | 'speaker_2')
                          }
                          className="bg-[#111827] border border-slate-700 rounded px-2 py-1 text-slate-100"
                        >
                          <option value="speaker_1">
                            {activeDebate.speakers.speaker_1.name}
                          </option>
                          <option value="speaker_2">
                            {activeDebate.speakers.speaker_2.name}
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
                      <div>
                        <span className="text-slate-400">Agreement Cosine: </span>
                        <span className="text-emerald-400 font-bold">
                          {(modelAgreement.agreementCosine * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Mean |Δ|: </span>
                        <span className="text-slate-200 font-semibold">
                          {modelAgreement.meanAbsoluteDelta.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Interactive SVG Radar Circumplex */}
                <div className="py-2">
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

                {/* Circumplex Layer Legend & Net Motivational Centroid Vector Summary */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      {activeRadarLayers.map((layer) => (
                        <div key={layer.id} className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-xs inline-block"
                            style={{ backgroundColor: layer.color }}
                          />
                          <span className="font-semibold text-slate-200">{layer.label}</span>
                          <span className="text-slate-500 font-mono text-[11px] tabular-nums">
                            (S̄ = {layer.profile.personalMean >= 0 ? '+' : ''}
                            {layer.profile.personalMean.toFixed(2)})
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Visual Layer Toggles */}
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showScatterPoints}
                          onChange={(e) => setShowScatterPoints(e.target.checked)}
                          className="accent-cyan-400 rounded"
                        />
                        <span>Utterance Scatter</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showCentroidVectors}
                          onChange={(e) => setShowCentroidVectors(e.target.checked)}
                          className="accent-cyan-400 rounded"
                        />
                        <span>Centroid Vector</span>
                      </label>
                    </div>
                  </div>

                  {/* Bipolar Dimension Readouts for Each Layer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeRadarLayers.slice(0, 2).map((layer) => (
                      <div
                        key={`bipolar-${layer.id}`}
                        className="p-3 bg-[#07090E] border border-slate-800 rounded space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold" style={{ color: layer.color }}>
                            {layer.label} · Net Centroid
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                            θ = {layer.profile.centroid.angleDeg.toFixed(0)}°
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                          <div>
                            <span className="text-slate-400 block">Openness vs. Conserv (X):</span>
                            <span className="text-slate-100 font-semibold">
                              {layer.profile.centroid.opennessVsConservation >= 0 ? '+' : ''}
                              {layer.profile.centroid.opennessVsConservation.toFixed(3)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Transcend vs. Enhance (Y):</span>
                            <span className="text-slate-100 font-semibold">
                              {layer.profile.centroid.transcendenceVsEnhancement >= 0 ? '+' : ''}
                              {layer.profile.centroid.transcendenceVsEnhancement.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Conditional Sub-Panels: Model Divergence Matrix OR History Vault OR Value Inspector Card */}
              {(isCompareMode || activeSection === 'comparison') && (
                <div className="bg-[#111827] border border-slate-800 rounded-md p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Per-Value Model Divergence Matrix ({primaryModel} vs. {comparisonModel})
                    </h3>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      10D Profile Cosine Agreement:{' '}
                      {(modelAgreement.agreementCosine * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="overflow-x-auto border border-slate-800 rounded">
                    <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="bg-[#07090E] border-b border-slate-800 text-slate-400">
                          <th className="py-2 px-3">Schwartz Value</th>
                          <th className="py-2 px-3 text-right text-cyan-400">
                            Model A ({primaryModel})
                          </th>
                          <th className="py-2 px-3 text-right text-pink-400">
                            Model B ({comparisonModel})
                          </th>
                          <th className="py-2 px-3 text-right">Signed Δ (A - B)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {modelAgreement.divergences.map((row) => (
                          <tr
                            key={row.valueId}
                            onClick={() => setSelectedValueId(row.valueId)}
                            className="hover:bg-slate-900/60 cursor-pointer"
                          >
                            <td className="py-2 px-3 font-sans font-medium text-slate-200">
                              {row.name}
                            </td>
                            <td className="py-2 px-3 text-right text-cyan-300">
                              {row.scoreA >= 0 ? '+' : ''}
                              {row.scoreA.toFixed(3)}
                            </td>
                            <td className="py-2 px-3 text-right text-pink-300">
                              {row.scoreB >= 0 ? '+' : ''}
                              {row.scoreB.toFixed(3)}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {row.signedDiff >= 0 ? '+' : ''}
                              {row.signedDiff.toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === 'vault' && (
                <div className="bg-[#111827] border border-slate-800 rounded-md p-5 space-y-3">
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

              {/* Value Inspector Card (Interactive Axis Drilldown) */}
              <div className="bg-[#111827] border border-slate-800 rounded-md p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <Compass className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        VALUE AXIS INSPECTOR · {selectedValueAxis.angleDeg}° ·{' '}
                        {selectedValueAxis.domain.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-100 mt-0.5">
                      {selectedValueAxis.name} — {selectedValueAxis.motivationalGoal}
                    </h3>
                  </div>

                  {/* Quick Axis Switcher Pills */}
                  <div className="flex flex-wrap gap-1">
                    {SCHWARTZ_CIRCUMPLEX_AXES.map((ax) => (
                      <button
                        key={ax.id}
                        type="button"
                        onClick={() => setSelectedValueId(ax.id)}
                        className={`px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                          selectedValueId === ax.id
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-[#07090E] text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {ax.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speaker Score Comparison for Selected Value */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[speaker1Profile, speaker2Profile].map((sp) => {
                    const axisScore = sp.scores[selectedValueId];
                    if (!axisScore) return null;
                    return (
                      <div
                        key={sp.speakerId}
                        className="p-3.5 bg-[#07090E] border border-slate-800 rounded space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-semibold" style={{ color: sp.color }}>
                            {sp.speakerName}
                          </span>
                          <div className="text-xs font-mono tabular-nums space-x-3">
                            <span className="text-slate-400">
                              Raw S_k:{' '}
                              <strong className="text-slate-200">
                                {axisScore.rawCumulativeScore >= 0 ? '+' : ''}
                                {axisScore.rawCumulativeScore.toFixed(2)}
                              </strong>
                            </span>
                            <span className="text-slate-400">
                              Ipsative I_k:{' '}
                              <strong
                                className={
                                  axisScore.ipsativeScore >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }
                              >
                                {axisScore.ipsativeScore >= 0 ? '+' : ''}
                                {axisScore.ipsativeScore.toFixed(2)}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* Top Contributing Endorsing Quotes */}
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-mono text-emerald-400">
                            Endorsing Utterances (+Δ, n={axisScore.endorsementCount})
                          </div>
                          {axisScore.topEndorsingQuotes.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">
                              No utterances exceeded +τ threshold on this axis yet.
                            </p>
                          ) : (
                            axisScore.topEndorsingQuotes.map((q) => (
                              <div
                                key={q.utteranceId}
                                onClick={() => handleSeekToTimestamp(q.timestamp, q.utteranceId)}
                                className="p-2 bg-[#111827] hover:bg-slate-800/80 border border-slate-800 rounded text-xs cursor-pointer transition-colors"
                              >
                                <div className="flex justify-between font-mono text-[10px] text-emerald-400 mb-0.5 tabular-nums">
                                  <span>#{q.sentenceIndex} · {q.speakerName} (@{formatTimestamp(q.timestamp)})</span>
                                  <span>Δ = +{q.delta.toFixed(3)}</span>
                                </div>
                                <p className="text-slate-200 line-clamp-2">"{q.text}"</p>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Top Opposing / Rejecting Quotes */}
                        {axisScore.topOpposingQuotes.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <div className="text-[11px] font-mono text-rose-400">
                              Opposing / Subordinating Utterances (-Δ, n={axisScore.rejectionCount})
                            </div>
                            {axisScore.topOpposingQuotes.map((q) => (
                              <div
                                key={q.utteranceId}
                                onClick={() => handleSeekToTimestamp(q.timestamp, q.utteranceId)}
                                className="p-2 bg-[#111827] hover:bg-slate-800/80 border border-slate-800 rounded text-xs cursor-pointer transition-colors"
                              >
                                <div className="flex justify-between font-mono text-[10px] text-rose-400 mb-0.5 tabular-nums">
                                  <span>#{q.sentenceIndex} · {q.speakerName} (@{formatTimestamp(q.timestamp)})</span>
                                  <span>Δ = {q.delta.toFixed(3)}</span>
                                </div>
                                <p className="text-slate-200 line-clamp-2">"{q.text}"</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
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
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
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
                </div>
              </div>
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
    </div>
  );
}
