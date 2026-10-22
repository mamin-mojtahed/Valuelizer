import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { TranscriptTurn } from '../constants/schwartzAnchors';
import { formatTimestamp } from '../utils/schwartzMath';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string;
  durationSeconds: number;
  turns: TranscriptTurn[];
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (seconds: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  seekRequest: { timestamp: number; nonce: number } | null;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  durationSeconds,
  turns,
  currentTime,
  isPlaying,
  onTimeUpdate,
  onPlayStateChange,
  seekRequest,
}) => {
  const containerId = useRef(`yt-player-${Math.random().toString(36).slice(2, 9)}`);
  const playerRef = useRef<any>(null);
  const [ytReady, setYtReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Compute effective timeline duration based on parsed conversational turns to ensure zero trailing gap
  const effectiveDuration = useMemo(() => {
    if (turns && turns.length > 0) {
      const maxTurnEnd = Math.max(...turns.map((t) => t.endTime || t.timestamp || 0));
      if (maxTurnEnd > 0) {
        if (!durationSeconds || durationSeconds > maxTurnEnd + 2) {
          return Math.round(maxTurnEnd);
        }
      }
    }
    return durationSeconds || 180;
  }, [turns, durationSeconds]);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtReady(true);
      return;
    }

    const existingScript = document.getElementById('youtube-iframe-api');
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      setYtReady(true);
    };

    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []);

  // Initialize or update player when videoId changes
  useEffect(() => {
    if (!ytReady) return;

    if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
      try {
        playerRef.current.loadVideoById({ videoId, startSeconds: 0 });
        playerRef.current.seekTo(0, true);
        playerRef.current.pauseVideo();
        onTimeUpdate(0);
      } catch (_e) {
        // Fallback handled by synthetic clock
      }
      return;
    }

    try {
      playerRef.current = new window.YT.Player(containerId.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          start: 0,
        },
        events: {
          onReady: () => {
            onTimeUpdate(0);
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              onPlayStateChange(true);
            } else if (
              event.data === window.YT.PlayerState.PAUSED ||
              event.data === window.YT.PlayerState.ENDED
            ) {
              onPlayStateChange(false);
            }
          },
        },
      });
    } catch (_err) {
      // Ignore if YT blocked in sandbox
    }
  }, [ytReady, videoId]);

  // Handle programmatic seek requests (from clicking transcript sentences or radar scatter dots)
  useEffect(() => {
    if (!seekRequest) return;
    onTimeUpdate(seekRequest.timestamp);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(seekRequest.timestamp, true);
      } catch (_e) {
        // Handled by internal clock
      }
    }
  }, [seekRequest]);

  // Millisecond/100ms playhead tracking loop (bridges live YT player + deterministic clock so Sync mode always works)
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      let polledTime: number | null = null;
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        try {
          const state = playerRef.current.getPlayerState?.();
          if (state === 1) {
            polledTime = playerRef.current.getCurrentTime();
          }
        } catch (_e) {
          polledTime = null;
        }
      }

      if (polledTime !== null && !Number.isNaN(polledTime) && polledTime >= 0) {
        onTimeUpdate(Math.min(effectiveDuration, polledTime));
      } else {
        onTimeUpdate(
          currentTime + 0.1 >= effectiveDuration ? effectiveDuration : currentTime + 0.1
        );
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, effectiveDuration, onTimeUpdate]);

  const togglePlay = () => {
    const next = !isPlaying;
    onPlayStateChange(next);
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      try {
        if (next) {
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
      } catch (_e) {
        // Internal clock handles playback
      }
    }
  };

  const handleReset = () => {
    onPlayStateChange(false);
    onTimeUpdate(0);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(0, true);
        playerRef.current.pauseVideo();
      } catch (_e) {
        // Ignore
      }
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (playerRef.current && typeof playerRef.current.mute === 'function') {
      try {
        if (next) playerRef.current.mute();
        else playerRef.current.unMute();
      } catch (_e) {
        // Ignore
      }
    }
  };

  const handlePrevSentence = () => {
    if (!turns || turns.length === 0) return;
    const currIdx = turns.findIndex((t) => currentTime >= t.timestamp && currentTime <= t.endTime);
    let targetIdx = -1;
    if (currIdx > 0) {
      if (currentTime - turns[currIdx].timestamp > 1.2) {
        targetIdx = currIdx;
      } else {
        targetIdx = currIdx - 1;
      }
    } else if (currIdx === 0) {
      targetIdx = 0;
    } else {
      const past = turns.map((t, idx) => ({ t, idx })).filter(({ t }) => t.timestamp < currentTime);
      targetIdx = past.length > 0 ? past[past.length - 1].idx : 0;
    }
    const targetTime = turns[targetIdx].timestamp;
    onTimeUpdate(targetTime);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(targetTime, true);
      } catch (_e) {
        // Ignore
      }
    }
  };

  const handleNextSentence = () => {
    if (!turns || turns.length === 0) return;
    const currIdx = turns.findIndex((t) => currentTime >= t.timestamp && currentTime < t.endTime);
    let targetIdx = -1;
    if (currIdx >= 0 && currIdx < turns.length - 1) {
      targetIdx = currIdx + 1;
    } else if (currIdx === -1) {
      const future = turns.map((t, idx) => ({ t, idx })).filter(({ t }) => t.timestamp > currentTime);
      targetIdx = future.length > 0 ? future[0].idx : turns.length - 1;
    } else {
      targetIdx = turns.length - 1;
    }
    const targetTime = turns[targetIdx].timestamp;
    onTimeUpdate(targetTime);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(targetTime, true);
      } catch (_e) {
        // Ignore
      }
    }
  };

  return (
    <div className="bg-[#0B0E17] border border-slate-800 rounded-md overflow-hidden">
      {/* 16:9 YouTube IFrame Viewport */}
      <div className="relative aspect-video w-full bg-black">
        <div id={containerId.current} className="w-full h-full" />
      </div>

      {/* Precision Telemetry Scrubber & Playback Controls */}
      <div className="p-2.5 border-t border-slate-800 space-y-2">
        {/* Interactive Sentence Splits Slider Bar */}
        <div
          className="relative h-6 bg-[#07090E] border border-slate-800 rounded overflow-hidden group cursor-ew-resize select-none"
          title="Sentence splits scrubber: drag or click to scrub video playhead"
        >
          {/* Diarized Speaker Sentence Segments */}
          {turns.map((t) => {
            const leftPct = (t.timestamp / effectiveDuration) * 100;
            const widthPct = Math.max(0.6, ((t.endTime - t.timestamp) / effectiveDuration) * 100);
            const isSpeaker1 = t.speakerId === 'speaker_1';
            const isEvaluatedAtTime = t.timestamp <= currentTime;
            return (
              <div
                key={t.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                className={`absolute top-0 bottom-0 border-r border-[#07090E]/60 transition-opacity ${
                  isSpeaker1 ? 'bg-cyan-500' : 'bg-amber-500'
                } ${isEvaluatedAtTime ? 'opacity-75' : 'opacity-25'}`}
              />
            );
          })}

          {/* Playhead Needle and Scrub Handle */}
          <div
            style={{
              left: `${Math.min(100, Math.max(0, (currentTime / (effectiveDuration || 1)) * 100))}%`,
            }}
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_#ffffff] z-10 pointer-events-none"
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-4 bg-white border border-slate-900 rounded-[2px] shadow-md ring-1 ring-cyan-400" />
          </div>

          {/* Integrated Native Range Scrubber (Directly over the Sentence Splits Bar) */}
          <input
            type="range"
            min={0}
            max={effectiveDuration || 100}
            step={0.25}
            value={currentTime}
            onChange={(e) => {
              const sec = parseFloat(e.target.value);
              onTimeUpdate(sec);
              if (playerRef.current?.seekTo) {
                try {
                  playerRef.current.seekTo(sec, true);
                } catch (_err) {
                  // Handled by synthetic clock
                }
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
            aria-label="Sentence splits playback scrubber"
          />
        </div>

        {/* Compact Transport Bar with Prev/Next Sentence buttons on left of timestamps */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePlay}
              className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors cursor-pointer"
              title="Reset Playhead to 00:00"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors cursor-pointer"
              title={isMuted ? 'Unmute Player' : 'Mute Player'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Prev/Next Sentence Buttons on the Left Side of Time Telemetry Readout */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevSentence}
                disabled={turns.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-slate-300 hover:text-cyan-300 bg-[#07090E] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-[11px] font-mono transition-colors cursor-pointer disabled:opacity-40"
                title="Jump to previous sentence"
              >
                <SkipBack className="w-3 h-3 text-cyan-400" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={handleNextSentence}
                disabled={turns.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-slate-300 hover:text-cyan-300 bg-[#07090E] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-[11px] font-mono transition-colors cursor-pointer disabled:opacity-40"
                title="Jump to next sentence"
              >
                <span>Next</span>
                <SkipForward className="w-3 h-3 text-cyan-400" />
              </button>
            </div>

            {/* Time Telemetry Readout */}
            <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-slate-300 pl-1 border-l border-slate-800/80">
              <span className="text-cyan-400 font-semibold">{formatTimestamp(currentTime)}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">{formatTimestamp(effectiveDuration)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
