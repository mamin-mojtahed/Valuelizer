import React, { useState } from 'react';
import {
  HIGHER_ORDER_QUADRANTS,
  SCHWARTZ_CIRCUMPLEX_AXES,
  SchwartzValueId,
} from '../constants/schwartzAnchors';
import {
  describeArcBand,
  EvaluatedUtterance,
  formatTimestamp,
  ipsativeToRadius,
  polarToCartesian,
  SpeakerValueProfile,
} from '../utils/schwartzMath';

export interface RadarPolygonLayer {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  profile: SpeakerValueProfile;
  dashed?: boolean;
}

interface RadarCircumplexProps {
  layers: RadarPolygonLayer[];
  utterances: EvaluatedUtterance[];
  selectedValueId: SchwartzValueId;
  onSelectValue: (valueId: SchwartzValueId) => void;
  onSeekToTimestamp: (seconds: number, utteranceId?: string) => void;
  showScatterPoints?: boolean;
  showCentroidVectors?: boolean;
  upToTimestamp?: number;
}

export const RadarCircumplex: React.FC<RadarCircumplexProps> = ({
  layers,
  utterances,
  selectedValueId,
  onSelectValue,
  onSeekToTimestamp,
  showScatterPoints = true,
  showCentroidVectors = true,
  upToTimestamp,
}) => {
  const [hoveredDot, setHoveredDot] = useState<{
    utteranceId: string;
    sentenceIndex: number;
    speakerId: string;
    speakerName: string;
    valueName: string;
    delta: number;
    timestamp: number;
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const size = 660;
  const cx = size / 2;
  const cy = size / 2;
  const minInnerRadius = 38;
  const neutralRadius = 128; // I_k = 0 Ipsative Neutral Baseline Ring
  const maxRadius = 228;
  const quadrantInnerR = 238;
  const quadrantOuterR = 250;

  // Dynamic scale normalization across active layers so polygons utilize full dynamic range cleanly
  let maxObservedAbsIpsative = 0.35;
  for (const layer of layers) {
    for (const val of layer.profile.ipsativeVector) {
      if (Math.abs(val) > maxObservedAbsIpsative) {
        maxObservedAbsIpsative = Math.abs(val);
      }
    }
  }
  const scaleBound = Math.max(0.32, Math.min(1.2, maxObservedAbsIpsative * 1.18));

  const ringSteps = [
    { r: minInnerRadius, label: `-${scaleBound.toFixed(2)}`, isNeutral: false },
    { r: (minInnerRadius + neutralRadius) / 2, label: `-${(scaleBound / 2).toFixed(2)}`, isNeutral: false },
    { r: neutralRadius, label: '0.00 (I_k = 0)', isNeutral: true },
    { r: (neutralRadius + maxRadius) / 2, label: `+${(scaleBound / 2).toFixed(2)}`, isNeutral: false },
    { r: maxRadius, label: `+${scaleBound.toFixed(2)}`, isNeutral: false },
  ];

  // Filter utterances up to playhead if in sync mode
  const visibleUtterances = utterances.filter(
    (u) => upToTimestamp === undefined || u.timestamp <= upToTimestamp
  );

  return (
    <div className="relative w-full flex flex-col items-center select-none">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[580px] aspect-square cursor-crosshair overflow-visible"
        role="img"
        aria-label="Schwartz 10-Axis Circumplex Radar Chart"
      >
        <defs>
          {layers.map((layer) => (
            <marker
              key={`arrow-${layer.id}`}
              id={`centroid-arrow-${layer.id}`}
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={layer.color} />
            </marker>
          ))}
        </defs>

        {/* 1. Outer Higher-Order Quadrant Arcs */}
        {HIGHER_ORDER_QUADRANTS.map((q) => {
          const arcPath = describeArcBand(
            cx,
            cy,
            quadrantInnerR,
            quadrantOuterR,
            q.startAngle,
            q.endAngle
          );
          const midAngle = (q.startAngle + q.endAngle) / 2;
          const labelPos = polarToCartesian(cx, cy, quadrantOuterR + 48, midAngle);

          return (
            <g key={q.id}>
              <path
                d={arcPath}
                fill={q.color}
                stroke={q.strokeColor}
                strokeWidth={1.25}
                strokeOpacity={0.65}
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={q.strokeColor}
                className="text-[10px] font-mono font-semibold tracking-wider"
              >
                {q.name}
              </text>
            </g>
          );
        })}

        {/* Shared boundary marker at 72° (Hedonism between Openness & Self-Enhancement) */}
        {(() => {
          const innerPt = polarToCartesian(cx, cy, quadrantInnerR - 4, 72);
          const outerPt = polarToCartesian(cx, cy, quadrantOuterR + 4, 72);
          return (
            <line
              x1={innerPt.x}
              y1={innerPt.y}
              x2={outerPt.x}
              y2={outerPt.y}
              stroke="#FBBF24"
              strokeWidth={2}
              strokeDasharray="2 2"
            />
          );
        })()}

        {/* 2. Concentric Calibration Rings & Ipsative Neutral Circle (I_k = 0) */}
        {ringSteps.map((ring, idx) => (
          <g key={idx}>
            <circle
              cx={cx}
              cy={cy}
              r={ring.r}
              fill={ring.isNeutral ? 'rgba(15, 23, 42, 0.25)' : 'none'}
              stroke={ring.isNeutral ? '#94A3B8' : '#1E293B'}
              strokeWidth={ring.isNeutral ? 1.6 : 1}
              strokeDasharray={ring.isNeutral ? '6 4' : undefined}
            />
            <text
              x={cx + 6}
              y={cy - ring.r + 11}
              fill={ring.isNeutral ? '#CBD5E1' : '#475569'}
              className="text-[9px] font-mono tabular-nums"
            >
              {ring.label}
            </text>
          </g>
        ))}

        {/* Bipolar Orthogonal Reference Crosshairs */}
        <line
          x1={cx - maxRadius}
          y1={cy}
          x2={cx + maxRadius}
          y2={cy}
          stroke="#1E293B"
          strokeWidth={0.75}
          strokeDasharray="2 4"
        />
        <line
          x1={cx}
          y1={cy - maxRadius}
          x2={cx}
          y2={cy + maxRadius}
          stroke="#1E293B"
          strokeWidth={0.75}
          strokeDasharray="2 4"
        />

        {/* 3. The 10 Schwartz Radial Axes */}
        {SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
          const outerPt = polarToCartesian(cx, cy, maxRadius, axis.angleDeg);
          const labelPt = polarToCartesian(cx, cy, maxRadius + 38, axis.angleDeg);
          const isSelected = selectedValueId === axis.id;

          return (
            <g
              key={axis.id}
              onClick={() => onSelectValue(axis.id)}
              className="cursor-pointer group"
            >
              {/* Invisible wider hit area for smooth axis clicking */}
              <line
                x1={cx}
                y1={cy}
                x2={outerPt.x}
                y2={outerPt.y}
                stroke="transparent"
                strokeWidth={18}
              />
              {/* Visible radial spoke */}
              <line
                x1={cx}
                y1={cy}
                x2={outerPt.x}
                y2={outerPt.y}
                stroke={isSelected ? axis.color : '#334155'}
                strokeWidth={isSelected ? 2 : 1}
                strokeOpacity={isSelected ? 0.95 : 0.65}
              />

              {/* Axis perimeter node */}
              <circle
                cx={outerPt.x}
                cy={outerPt.y}
                r={isSelected ? 4.5 : 3}
                fill={isSelected ? axis.color : '#475569'}
              />

              {/* Axis Vertex Label + Degree */}
              <g transform={`translate(${labelPt.x}, ${labelPt.y})`}>
                <rect
                  x={-48}
                  y={-15}
                  width={96}
                  height={30}
                  rx={4}
                  fill={isSelected ? '#1E293B' : 'rgba(7, 9, 14, 0.85)'}
                  stroke={isSelected ? axis.color : '#1E293B'}
                  strokeWidth={isSelected ? 1.25 : 0.75}
                />
                <text
                  x={0}
                  y={-3}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected ? '#F8FAFC' : '#CBD5E1'}
                  className="text-[10.5px] font-semibold tracking-tight"
                >
                  {axis.name}
                </text>
                <text
                  x={0}
                  y={9}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected ? axis.color : '#64748B'}
                  className="text-[9px] font-mono tabular-nums"
                >
                  {axis.angleDeg}° {axis.id === SchwartzValueId.HEDONISM ? '· SHARED' : ''}
                </text>
              </g>
            </g>
          );
        })}

        {/* 4. Dynamic Radar Polygons for Each Active Speaker / Model Layer */}
        {layers.map((layer) => {
          const vertices = SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
            const score = layer.profile.scores[axis.id]?.ipsativeScore ?? 0;
            const r = ipsativeToRadius(
              score,
              neutralRadius,
              maxRadius,
              minInnerRadius,
              scaleBound
            );
            const pt = polarToCartesian(cx, cy, r, axis.angleDeg);
            return { ...pt, axis, score, r };
          });

          const polygonPoints = vertices.map((v) => `${v.x},${v.y}`).join(' ');

          return (
            <g key={layer.id}>
              <polygon
                points={polygonPoints}
                fill={layer.color}
                fillOpacity={layer.dashed ? 0.1 : 0.18}
                stroke={layer.color}
                strokeWidth={2.25}
                strokeDasharray={layer.dashed ? '6 3' : undefined}
                strokeLinejoin="round"
                className="transition-all duration-150"
              />
              {vertices.map((v) => (
                <circle
                  key={`${layer.id}-${v.axis.id}`}
                  cx={v.x}
                  cy={v.y}
                  r={selectedValueId === v.axis.id ? 5 : 3.5}
                  fill="#07090E"
                  stroke={layer.color}
                  strokeWidth={2.2}
                  onClick={() => onSelectValue(v.axis.id)}
                  className="cursor-pointer"
                />
              ))}
            </g>
          );
        })}

        {/* 5. Utterance Scatter Points along radial axes (clickable to seek video) */}
        {showScatterPoints &&
          visibleUtterances.map((u) => {
            // Plot a scatter point for each value axis where this utterance passed threshold
            return SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
              const d = u.deltas[axis.id];
              if (!d || !d.passedThreshold || Math.abs(d.thresholdedDelta) === 0) {
                return null;
              }

              // Map utterance delta (-0.40 to +0.40) relative to neutralRadius
              const radialOffset = (d.thresholdedDelta / 0.35) * (maxRadius - neutralRadius) * 0.85;
              const dotR = Math.max(
                minInnerRadius + 4,
                Math.min(maxRadius - 4, neutralRadius + radialOffset)
              );
              // Slight angular jitter (+/- 2.5 deg) by speaker so overlapping points remain clickable
              const jitter = u.speakerId === 'speaker_1' ? -2.2 : 2.2;
              const pt = polarToCartesian(cx, cy, dotR, axis.angleDeg + jitter);
              const dotColor = u.speakerId === 'speaker_1' ? '#06B6D4' : '#F59E0B';

              return (
                <circle
                  key={`scatter-${u.id}-${axis.id}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={3.2}
                  fill={dotColor}
                  fillOpacity={0.85}
                  stroke="#07090E"
                  strokeWidth={1}
                  className="cursor-pointer hover:scale-150 transition-transform"
                  onMouseEnter={() =>
                    setHoveredDot({
                      utteranceId: u.id,
                      sentenceIndex: u.sentenceIndex,
                      speakerId: u.speakerId,
                      speakerName: u.speakerName,
                      valueName: axis.name,
                      delta: d.thresholdedDelta,
                      timestamp: u.timestamp,
                      text: u.text,
                      x: pt.x,
                      y: pt.y,
                    })
                  }
                  onMouseLeave={() => setHoveredDot(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectValue(axis.id);
                    onSeekToTimestamp(u.timestamp, u.id);
                  }}
                />
              );
            });
          })}

        {/* 6. Net Motivational Centroid Vectors from Origin */}
        {showCentroidVectors &&
          layers.map((layer) => {
            const { centroid } = layer.profile;
            if (centroid.magnitude < 0.01) return null;

            const arrowLen = Math.min(
              neutralRadius - 12,
              Math.max(28, (centroid.magnitude / scaleBound) * (neutralRadius * 0.95))
            );
            const tip = polarToCartesian(cx, cy, arrowLen, centroid.angleDeg);

            return (
              <g key={`centroid-${layer.id}`}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={tip.x}
                  y2={tip.y}
                  stroke={layer.color}
                  strokeWidth={2.5}
                  markerEnd={`url(#centroid-arrow-${layer.id})`}
                />
              </g>
            );
          })}

        {/* Origin Crosshair Hub */}
        <circle cx={cx} cy={cy} r={4} fill="#0F172A" stroke="#94A3B8" strokeWidth={1.5} />
      </svg>

      {/* Floating Tooltip for Scatter Dot Inspection */}
      {hoveredDot && (
        <div
          className="pointer-events-none absolute z-20 max-w-sm bg-[#0B0E17]/95 border border-slate-700 rounded-md p-3 shadow-2xl text-xs space-y-1.5 backdrop-blur-sm"
          style={{
            top: '12px',
            right: '12px',
          }}
        >
          <div className="flex items-center justify-between gap-3 text-[11px] font-mono">
            <span className={hoveredDot.speakerId === 'speaker_1' ? 'text-cyan-400 font-bold' : 'text-amber-400 font-bold'}>
              #{hoveredDot.sentenceIndex} · {hoveredDot.speakerName}
            </span>
            <span className="text-slate-400 tabular-nums">@{formatTimestamp(hoveredDot.timestamp)}</span>
          </div>
          <div className="text-[11px] font-mono font-medium">
            <span className="text-slate-400">Value Delta: </span>
            <span className={hoveredDot.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {hoveredDot.valueName} ({hoveredDot.delta >= 0 ? '+' : ''}{hoveredDot.delta.toFixed(3)})
            </span>
          </div>
          <p className="text-slate-200 line-clamp-2 leading-relaxed text-xs">"{hoveredDot.text}"</p>
          <p className="text-[10px] font-mono text-cyan-400 pt-0.5">Click dot to seek video to exact sentence</p>
        </div>
      )}
    </div>
  );
};
