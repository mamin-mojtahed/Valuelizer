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
  isGhostSum?: boolean;
}

interface RadarCircumplexProps {
  layers: RadarPolygonLayer[];
  utterances: EvaluatedUtterance[];
  selectedValueId: SchwartzValueId | 'all';
  onSelectValue: (valueId: SchwartzValueId) => void;
  onSeekToTimestamp: (seconds: number, utteranceId?: string) => void;
  showScatterPoints?: boolean;
  showCentroidVectors?: boolean;
  upToTimestamp?: number;
  className?: string;
  fixedScaleBound?: number;
  isCompact?: boolean;
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
  className,
  fixedScaleBound,
  isCompact = false,
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

  const size = 700;
  const cx = size / 2;
  const cy = size / 2;
  const minInnerRadius = 38;
  const neutralRadius = 132; // I_k = 0 Ipsative Neutral Baseline Ring
  const maxRadius = 220;
  const quadrantInnerR = 290;
  const quadrantOuterR = 316;

  // Dynamic scale normalization across active layers so polygons utilize full dynamic range cleanly
  let maxObservedAbsIpsative = 0.35;
  for (const layer of layers) {
    for (const val of layer.profile.ipsativeVector) {
      if (Math.abs(val) > maxObservedAbsIpsative) {
        maxObservedAbsIpsative = Math.abs(val);
      }
    }
  }
  const scaleBound = fixedScaleBound ?? Math.max(0.32, Math.min(1.2, maxObservedAbsIpsative * 1.18));

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
        className={`w-full ${className || 'max-w-[620px]'} aspect-square cursor-crosshair overflow-visible`}
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

        {/* 1. Outer Higher-Order Quadrant Arcs & Curved Arced Titles */}
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
          const isBottom = midAngle > 90 && midAngle < 270;
          // Upper arc (sweep=1) baseline at 298 extends outward to ~308.
          // Lower arc (sweep=0) baseline at 308 extends inward to ~298.
          // Both sit perfectly centered in the 290-316 arc band with 8px padding on both sides.
          const textArcR = isBottom ? 308 : 298;
          const a1 = isBottom ? q.endAngle : q.startAngle;
          const a2 = isBottom ? q.startAngle : q.endAngle;
          const sweep = isBottom ? 0 : 1;
          const p1 = polarToCartesian(cx, cy, textArcR, a1);
          const p2 = polarToCartesian(cx, cy, textArcR, a2);
          const angleDiff = Math.abs(q.endAngle - q.startAngle);
          const largeArc = angleDiff > 180 ? 1 : 0;
          const textArcD = `M ${p1.x} ${p1.y} A ${textArcR} ${textArcR} 0 ${largeArc} ${sweep} ${p2.x} ${p2.y}`;

          const quadrantLabel = isCompact ? q.code : q.name;

          return (
            <g key={q.id}>
              <path
                d={arcPath}
                fill={q.color}
                stroke={q.strokeColor}
                strokeWidth={1.5}
                strokeOpacity={0.75}
              />
              <path
                id={`quadrant-text-path-${q.id}${isCompact ? '-compact' : ''}`}
                d={textArcD}
                fill="none"
                stroke="none"
              />
              <text className={`${isCompact ? 'text-[28px] font-black' : 'text-[11.5px] font-bold'} font-mono tracking-widest uppercase`}>
                <textPath
                  href={`#quadrant-text-path-${q.id}${isCompact ? '-compact' : ''}`}
                  startOffset="50%"
                  textAnchor="middle"
                  fill={q.strokeColor}
                >
                  {quadrantLabel}
                </textPath>
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

        {/* 3. The 10 Schwartz Radial Axes & Prominent Dimension Badges */}
        {SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
          const outerPt = polarToCartesian(cx, cy, maxRadius, axis.angleDeg);
          const labelPt = polarToCartesian(cx, cy, maxRadius + 38, axis.angleDeg);
          const isSelected = selectedValueId === axis.id;

          const labelText = isCompact ? axis.code : axis.name;
          const badgeWidth = isCompact ? 76 : 108;
          const badgeHeight = isCompact ? 44 : 28;

          return (
            <g
              key={axis.id}
              onClick={() => onSelectValue(axis.id)}
              className="cursor-pointer group"
            >
              <title>{`${axis.name} (${axis.code}): ${axis.motivationalGoal}`}</title>
              {/* Invisible wider hit area for smooth axis clicking */}
              <line
                x1={cx}
                y1={cy}
                x2={outerPt.x}
                y2={outerPt.y}
                stroke="transparent"
                strokeWidth={20}
              />
              {/* Visible radial spoke */}
              <line
                x1={cx}
                y1={cy}
                x2={outerPt.x}
                y2={outerPt.y}
                stroke={isSelected ? axis.color : '#334155'}
                strokeWidth={isSelected ? 2.5 : 1.25}
                strokeOpacity={isSelected ? 1 : 0.7}
              />

              {/* Axis perimeter node */}
              <circle
                cx={outerPt.x}
                cy={outerPt.y}
                r={isSelected ? 5 : 3.5}
                fill={isSelected ? axis.color : '#475569'}
              />

              {/* Axis Vertex Label Badge (Doubled text size for ultra-prominent 2-letter acronyms in compact mode) */}
              <g transform={`translate(${labelPt.x}, ${labelPt.y})`}>
                <rect
                  x={-badgeWidth / 2}
                  y={-badgeHeight / 2}
                  width={badgeWidth}
                  height={badgeHeight}
                  rx={isCompact ? 8 : 6}
                  fill={isSelected ? '#0F172A' : '#090D16'}
                  stroke={isSelected ? axis.color : '#334155'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  className="transition-all duration-150 group-hover:stroke-slate-400"
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected ? '#FFFFFF' : '#F1F5F9'}
                  className={`${
                    isCompact ? 'text-[32px] font-black' : 'text-[12.5px] font-bold'
                  } tracking-tight`}
                >
                  {labelText}
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
          const isGhost = Boolean(layer.isGhostSum);

          return (
            <g key={layer.id} opacity={isGhost ? 0.58 : 1}>
              <polygon
                points={polygonPoints}
                fill={layer.color}
                fillOpacity={isGhost ? 0.05 : layer.dashed ? 0.1 : 0.18}
                stroke={layer.color}
                strokeOpacity={isGhost ? 0.65 : 1}
                strokeWidth={isGhost ? 1.5 : 2.25}
                strokeDasharray={isGhost ? '5 3' : layer.dashed ? '6 3' : undefined}
                strokeLinejoin="round"
                className="transition-all duration-150"
              />
              {vertices.map((v) => (
                <circle
                  key={`${layer.id}-${v.axis.id}`}
                  cx={v.x}
                  cy={v.y}
                  r={isGhost ? 2.2 : selectedValueId === v.axis.id ? 5 : 3.5}
                  fill="#07090E"
                  stroke={layer.color}
                  strokeOpacity={isGhost ? 0.65 : 1}
                  strokeWidth={isGhost ? 1.4 : 2.2}
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
                  r={3.5}
                  fill={dotColor}
                  fillOpacity={0.85}
                  stroke="#07090E"
                  strokeWidth={1}
                  className="cursor-pointer hover:stroke-white hover:stroke-[2px] hover:fill-opacity-100 transition-colors"
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
            const isGhost = Boolean(layer.isGhostSum);

            const arrowLen = Math.min(
              neutralRadius - 12,
              Math.max(28, (centroid.magnitude / scaleBound) * (neutralRadius * 0.95))
            );
            const tip = polarToCartesian(cx, cy, arrowLen, centroid.angleDeg);

            return (
              <g key={`centroid-${layer.id}`} opacity={isGhost ? 0.35 : 1}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={tip.x}
                  y2={tip.y}
                  stroke={layer.color}
                  strokeWidth={isGhost ? 1.5 : 2.5}
                  strokeDasharray={isGhost ? '4 2' : undefined}
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
