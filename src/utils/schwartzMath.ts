import {
  HigherOrderDomain,
  SCHWARTZ_CIRCUMPLEX_AXES,
  SchwartzValueId,
} from '../constants/schwartzAnchors';

export interface TranscriptSentence {
  id: string;
  turnId: string;
  sentenceIndex: number;
  timestamp: number;
  endTime: number;
  speakerId: 'speaker_1' | 'speaker_2';
  text: string;
}

export interface ValuePolarityDelta {
  valueId: SchwartzValueId;
  cosPos: number;
  cosNeg: number;
  rawDelta: number; // cos(u, c_k^+) - cos(u, c_k^-)
  thresholdedDelta: number; // 0 if |rawDelta| < tau, else rawDelta
  passedThreshold: boolean;
}

export interface EvaluatedUtterance {
  id: string;
  turnId: string;
  sentenceIndex: number;
  timestamp: number;
  endTime: number;
  speakerId: 'speaker_1' | 'speaker_2';
  speakerName: string;
  speakerRole: string;
  text: string;
  previousText?: string;
  contextExpandedInput: string;
  deltas: Record<SchwartzValueId, ValuePolarityDelta>;
  dominantBadges: Array<{
    valueId: SchwartzValueId;
    name: string;
    shortLabel: string;
    delta: number;
    polarity: '+' | '-';
    color: string;
  }>;
  verifierAudit?: {
    verifiedValueId: string;
    verifiedPolarity: number;
    rationale: string;
  };
}

export interface ValueAxisScore {
  valueId: SchwartzValueId;
  name: string;
  shortLabel: string;
  angleDeg: number;
  domain: HigherOrderDomain;
  rawCumulativeScore: number; // S_k = sum_i Delta_{k, i}
  ipsativeScore: number; // I_k = S_k - S_bar
  endorsementCount: number;
  rejectionCount: number;
  topEndorsingQuotes: Array<{
    utteranceId: string;
    sentenceIndex: number;
    speakerName: string;
    timestamp: number;
    text: string;
    delta: number;
  }>;
  topOpposingQuotes: Array<{
    utteranceId: string;
    sentenceIndex: number;
    speakerName: string;
    timestamp: number;
    text: string;
    delta: number;
  }>;
}

/**
 * Deterministically splits conversational turns into individual grammatical sentences,
 * calculating accurate interpolated time boundaries and preserving sequential index.
 */
export function segmentTurnsIntoSentences(
  turns: Array<{
    id: string;
    timestamp: number;
    endTime: number;
    speakerId: 'speaker_1' | 'speaker_2';
    text: string;
  }>
): TranscriptSentence[] {
  const result: TranscriptSentence[] = [];
  let globalSentenceIndex = 1;

  for (const turn of turns) {
    // Split on sentence boundaries (. ? !) while avoiding titles like Dr. or e.g.
    const rawParts = turn.text
      .replace(/([.?!])\s+(?=[A-Z0-9"'])/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (rawParts.length <= 1) {
      result.push({
        id: `${turn.id}-s1`,
        turnId: turn.id,
        sentenceIndex: globalSentenceIndex++,
        speakerId: turn.speakerId,
        timestamp: turn.timestamp,
        endTime: turn.endTime,
        text: turn.text.trim(),
      });
      continue;
    }

    const duration = Math.max(2, turn.endTime - turn.timestamp);
    const totalChars = rawParts.reduce((acc, s) => acc + s.length, 0) || 1;
    let runningStart = turn.timestamp;

    rawParts.forEach((sentence, idx) => {
      const share = sentence.length / totalChars;
      const sentDuration = Math.max(1.5, Math.round(duration * share * 10) / 10);
      const startT = Math.round(runningStart * 10) / 10;
      const endT =
        idx === rawParts.length - 1
          ? turn.endTime
          : Math.round(Math.min(turn.endTime, startT + sentDuration) * 10) / 10;
      runningStart = endT;

      result.push({
        id: `${turn.id}-s${idx + 1}`,
        turnId: turn.id,
        sentenceIndex: globalSentenceIndex++,
        speakerId: turn.speakerId,
        timestamp: startT,
        endTime: endT,
        text: sentence,
      });
    });
  }

  return result;
}

export interface NetMotivationalCentroid {
  /** X-axis: Openness to Change (+) vs. Conservation (-) */
  opennessVsConservation: number;
  /** Y-axis: Self-Transcendence (+) vs. Self-Enhancement (-) */
  transcendenceVsEnhancement: number;
  magnitude: number;
  angleDeg: number;
  dominantOrientationLabel: string;
}

export interface SpeakerValueProfile {
  speakerId: string;
  speakerName: string;
  color: string;
  evaluatedCount: number;
  personalMean: number; // S_bar = (1/10) * sum_{k=1}^{10} S_k
  scores: Record<SchwartzValueId, ValueAxisScore>;
  ipsativeVector: number[]; // Ordered 10D vector matching SCHWARTZ_CIRCUMPLEX_AXES
  rawVector: number[];
  centroid: NetMotivationalCentroid;
}

/**
 * 1. Context Window Expansion:
 * Prepend the immediately preceding speaker turn to preserve conversational context:
 * Input String = `Previous: "` + Turn_{i-1} + `" | Current: "` + Turn_i + `"`
 */
export function buildContextExpandedInput(currentTurn: string, previousTurn?: string): string {
  const prev = previousTurn ? previousTurn.trim() : 'Conversation start';
  return `Previous: "${prev}" | Current: "${currentTurn.trim()}"`;
}

/**
 * Standard L2-normalized vector Cosine Similarity:
 * cos(A, B) = (A . B) / (||A|| * ||B||)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return dot / denom;
}

/**
 * 2. Polarity Differential & 3. Threshold & Subtraction:
 * Delta_{k, i} = cos(u_i, c_k^+) - cos(u_i, c_k^-)
 * If |Delta_{k, i}| >= tau (default 0.08):
 *   If Delta_{k, i} > 0 -> +|Delta_{k, i}|
 *   If Delta_{k, i} < 0 -> -|Delta_{k, i}|
 */
export function computeDualAnchorDeltas(
  utteranceVector: number[],
  anchorVectors: Record<SchwartzValueId, { pos: number[]; neg: number[] }>,
  thresholdTau = 0.08
): Record<SchwartzValueId, ValuePolarityDelta> {
  const result = {} as Record<SchwartzValueId, ValuePolarityDelta>;

  for (const axis of SCHWARTZ_CIRCUMPLEX_AXES) {
    const anchors = anchorVectors[axis.id];
    const cosPos = anchors ? cosineSimilarity(utteranceVector, anchors.pos) : 0;
    const cosNeg = anchors ? cosineSimilarity(utteranceVector, anchors.neg) : 0;
    const rawDelta = cosPos - cosNeg;
    const absDelta = Math.abs(rawDelta);
    const passedThreshold = absDelta >= thresholdTau;
    const thresholdedDelta = passedThreshold
      ? rawDelta > 0
        ? absDelta
        : -absDelta
      : 0;

    result[axis.id] = {
      valueId: axis.id,
      cosPos,
      cosNeg,
      rawDelta,
      thresholdedDelta,
      passedThreshold,
    };
  }

  return result;
}

/**
 * Extract top value badges for an utterance that exceed the threshold tau
 */
export function extractDominantBadges(
  deltas: Record<SchwartzValueId, ValuePolarityDelta>,
  maxBadges = 3
): EvaluatedUtterance['dominantBadges'] {
  return SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
    const d = deltas[axis.id];
    return {
      valueId: axis.id,
      name: axis.name,
      shortLabel: axis.shortLabel,
      delta: d.thresholdedDelta,
      polarity: (d.thresholdedDelta >= 0 ? '+' : '-') as '+' | '-',
      color: axis.color,
      passed: d.passedThreshold,
    };
  })
    .filter((item) => item.passed && Math.abs(item.delta) > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, maxBadges)
    .map(({ passed: _p, ...rest }) => rest);
}

/**
 * C. Ipsative (Centered) Radar Chart Math:
 * 1. Sum raw cumulative scores across all 10 values: S_k = sum_i Delta_{k, i}
 * 2. Compute speaker's personal mean: S_bar = (1/10) * sum_{k=1}^{10} S_k
 * 3. Compute Ipsative Score: I_k = S_k - S_bar
 */
export function computeSpeakerProfile(
  utterances: EvaluatedUtterance[],
  speakerId: string,
  speakerName: string,
  color: string,
  upToTimestamp?: number
): SpeakerValueProfile {
  const filtered = utterances.filter(
    (u) =>
      u.speakerId === speakerId &&
      (upToTimestamp === undefined || u.timestamp <= upToTimestamp)
  );

  const rawSums: Record<SchwartzValueId, number> = {} as Record<SchwartzValueId, number>;
  const endorsementCounts: Record<SchwartzValueId, number> = {} as Record<SchwartzValueId, number>;
  const rejectionCounts: Record<SchwartzValueId, number> = {} as Record<SchwartzValueId, number>;
  const endorsingQuotes: Record<
    SchwartzValueId,
    Array<{
      utteranceId: string;
      sentenceIndex: number;
      speakerName: string;
      timestamp: number;
      text: string;
      delta: number;
    }>
  > = {} as any;
  const opposingQuotes: Record<
    SchwartzValueId,
    Array<{
      utteranceId: string;
      sentenceIndex: number;
      speakerName: string;
      timestamp: number;
      text: string;
      delta: number;
    }>
  > = {} as any;

  for (const axis of SCHWARTZ_CIRCUMPLEX_AXES) {
    rawSums[axis.id] = 0;
    endorsementCounts[axis.id] = 0;
    rejectionCounts[axis.id] = 0;
    endorsingQuotes[axis.id] = [];
    opposingQuotes[axis.id] = [];
  }

  for (const u of filtered) {
    for (const axis of SCHWARTZ_CIRCUMPLEX_AXES) {
      const d = u.deltas[axis.id];
      if (!d || !d.passedThreshold) continue;

      if (d.thresholdedDelta > 0) {
        rawSums[axis.id] += Math.abs(d.thresholdedDelta);
        endorsementCounts[axis.id] += 1;
        endorsingQuotes[axis.id].push({
          utteranceId: u.id,
          sentenceIndex: u.sentenceIndex,
          speakerName: u.speakerName || speakerName,
          timestamp: u.timestamp,
          text: u.text,
          delta: d.thresholdedDelta,
        });
      } else if (d.thresholdedDelta < 0) {
        rawSums[axis.id] -= Math.abs(d.thresholdedDelta);
        rejectionCounts[axis.id] += 1;
        opposingQuotes[axis.id].push({
          utteranceId: u.id,
          sentenceIndex: u.sentenceIndex,
          speakerName: u.speakerName || speakerName,
          timestamp: u.timestamp,
          text: u.text,
          delta: d.thresholdedDelta,
        });
      }
    }
  }

  // Personal mean S_bar = (1/10) * sum_{k=1}^{10} S_k
  let totalRaw = 0;
  for (const axis of SCHWARTZ_CIRCUMPLEX_AXES) {
    totalRaw += rawSums[axis.id];
  }
  const personalMean = totalRaw / 10;

  const scores = {} as Record<SchwartzValueId, ValueAxisScore>;
  const ipsativeVector: number[] = [];
  const rawVector: number[] = [];

  for (const axis of SCHWARTZ_CIRCUMPLEX_AXES) {
    const rawCumulativeScore = rawSums[axis.id];
    const ipsativeScore = rawCumulativeScore - personalMean;
    ipsativeVector.push(ipsativeScore);
    rawVector.push(rawCumulativeScore);

    scores[axis.id] = {
      valueId: axis.id,
      name: axis.name,
      shortLabel: axis.shortLabel,
      angleDeg: axis.angleDeg,
      domain: axis.domain,
      rawCumulativeScore,
      ipsativeScore,
      endorsementCount: endorsementCounts[axis.id],
      rejectionCount: rejectionCounts[axis.id],
      topEndorsingQuotes: endorsingQuotes[axis.id]
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3),
      topOpposingQuotes: opposingQuotes[axis.id]
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 3),
    };
  }

  // Compute Net Motivational Centroid Vector across the two bipolar dimensions:
  // X-axis: Openness to Change (Self-Direction, Stimulation, 0.5*Hedonism) vs Conservation (Security, Conformity, Tradition)
  // Y-axis: Self-Transcendence (Benevolence, Universalism) vs Self-Enhancement (Achievement, Power, 0.5*Hedonism)
  const openness =
    (scores[SchwartzValueId.SELF_DIRECTION].ipsativeScore +
      scores[SchwartzValueId.STIMULATION].ipsativeScore +
      0.5 * scores[SchwartzValueId.HEDONISM].ipsativeScore) /
    2.5;
  const conservation =
    (scores[SchwartzValueId.SECURITY].ipsativeScore +
      scores[SchwartzValueId.CONFORMITY].ipsativeScore +
      scores[SchwartzValueId.TRADITION].ipsativeScore) /
    3;

  const transcendence =
    (scores[SchwartzValueId.BENEVOLENCE].ipsativeScore +
      scores[SchwartzValueId.UNIVERSALISM].ipsativeScore) /
    2;
  const enhancement =
    (scores[SchwartzValueId.ACHIEVEMENT].ipsativeScore +
      scores[SchwartzValueId.POWER].ipsativeScore +
      0.5 * scores[SchwartzValueId.HEDONISM].ipsativeScore) /
    2.5;

  const opennessVsConservation = openness - conservation;
  const transcendenceVsEnhancement = transcendence - enhancement;
  const magnitude = Math.sqrt(
    opennessVsConservation * opennessVsConservation +
      transcendenceVsEnhancement * transcendenceVsEnhancement
  );

  // Also compute geometric circumplex vector sum for SVG arrow rendering
  let vecX = 0;
  let vecY = 0;
  for (const axis of SCHWARTZ_CIRCUMPLEX_AXES) {
    const rad = ((axis.angleDeg - 90) * Math.PI) / 180;
    const val = scores[axis.id].ipsativeScore;
    vecX += val * Math.cos(rad);
    vecY += val * Math.sin(rad);
  }
  const angleDeg = ((Math.atan2(vecY, vecX) * 180) / Math.PI + 90 + 360) % 360;

  let dominantOrientationLabel = 'Balanced Equilibrium';
  if (magnitude > 0.04) {
    const xLabel = opennessVsConservation >= 0 ? 'Openness' : 'Conservation';
    const yLabel = transcendenceVsEnhancement >= 0 ? 'Self-Transcendence' : 'Self-Enhancement';
    dominantOrientationLabel = `${xLabel} · ${yLabel}`;
  }

  return {
    speakerId,
    speakerName,
    color,
    evaluatedCount: filtered.length,
    personalMean,
    scores,
    ipsativeVector,
    rawVector,
    centroid: {
      opennessVsConservation,
      transcendenceVsEnhancement,
      magnitude,
      angleDeg,
      dominantOrientationLabel,
    },
  };
}

/**
 * Polar to Cartesian conversion for 10-axis SVG Circumplex
 * 0 deg (Self-Direction) is at top (12 o'clock)
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

/**
 * Map an Ipsative Score I_k onto a radial distance from the SVG center:
 * - neutralRadius represents I_k = 0 (dashed midline concentric circle)
 * - I_k > 0 expands outward toward maxRadius
 * - I_k < 0 contracts inward toward minInnerRadius
 */
export function ipsativeToRadius(
  ipsativeScore: number,
  neutralRadius: number,
  maxRadius: number,
  minInnerRadius: number,
  maxAbsScale = 0.65
): number {
  const clamped = Math.max(-maxAbsScale, Math.min(maxAbsScale, ipsativeScore));
  if (clamped >= 0) {
    return neutralRadius + (clamped / maxAbsScale) * (maxRadius - neutralRadius);
  } else {
    return neutralRadius + (clamped / maxAbsScale) * (neutralRadius - minInnerRadius);
  }
}

/**
 * Build an SVG annular arc path for the 4 higher-order quadrant arcs
 */
export function describeArcBand(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', startOuter.x, startOuter.y,
    'A', outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    'Z',
  ].join(' ');
}

/**
 * Model Comparison Math:
 * Calculates Agreement Score (Cosine Similarity between two 10D ipsative profile vectors)
 * and ranked per-value divergence list.
 */
export function computeModelAgreement(
  profileA: SpeakerValueProfile,
  profileB: SpeakerValueProfile
): {
  agreementCosine: number;
  meanAbsoluteDelta: number;
  divergences: Array<{
    valueId: SchwartzValueId;
    name: string;
    shortLabel: string;
    scoreA: number;
    scoreB: number;
    absDiff: number;
    signedDiff: number;
  }>;
} {
  const agreementCosine = cosineSimilarity(profileA.ipsativeVector, profileB.ipsativeVector);
  const divergences = SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
    const scoreA = profileA.scores[axis.id]?.ipsativeScore || 0;
    const scoreB = profileB.scores[axis.id]?.ipsativeScore || 0;
    const signedDiff = scoreA - scoreB;
    return {
      valueId: axis.id,
      name: axis.name,
      shortLabel: axis.shortLabel,
      scoreA,
      scoreB,
      absDiff: Math.abs(signedDiff),
      signedDiff,
    };
  }).sort((a, b) => b.absDiff - a.absDiff);

  const meanAbsoluteDelta =
    divergences.reduce((acc, d) => acc + d.absDiff, 0) / divergences.length;

  return {
    agreementCosine,
    meanAbsoluteDelta,
    divergences,
  };
}

export interface MultiModelComparisonResult {
  meanPairwiseCosine: number;
  meanSpread: number;
  pairwiseAgreements: Array<{
    modelA: string;
    modelB: string;
    cosine: number;
  }>;
  divergences: Array<{
    valueId: SchwartzValueId;
    name: string;
    scoresByModel: Record<string, number>;
    minScore: number;
    maxScore: number;
    spread: number;
  }>;
}

/**
 * Calculates multi-model agreement across 2, 3, or more embedding models:
 * Computes all pairwise 10D cosine similarities, mean inter-model agreement,
 * and ranked per-value variance/spread across all evaluated models.
 */
export function computeMultiModelAgreement(
  modelProfiles: Array<{ modelId: string; profile: SpeakerValueProfile }>
): MultiModelComparisonResult {
  if (modelProfiles.length < 2) {
    return {
      meanPairwiseCosine: 1,
      meanSpread: 0,
      pairwiseAgreements: [],
      divergences: SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => ({
        valueId: axis.id,
        name: axis.name,
        scoresByModel: {},
        minScore: 0,
        maxScore: 0,
        spread: 0,
      })),
    };
  }

  // Pairwise cosine similarity matrix
  const pairwiseAgreements: Array<{
    modelA: string;
    modelB: string;
    cosine: number;
  }> = [];

  let sumCosine = 0;
  for (let i = 0; i < modelProfiles.length; i++) {
    for (let j = i + 1; j < modelProfiles.length; j++) {
      const cos = cosineSimilarity(
        modelProfiles[i].profile.ipsativeVector,
        modelProfiles[j].profile.ipsativeVector
      );
      pairwiseAgreements.push({
        modelA: modelProfiles[i].modelId,
        modelB: modelProfiles[j].modelId,
        cosine: cos,
      });
      sumCosine += cos;
    }
  }

  const meanPairwiseCosine =
    pairwiseAgreements.length > 0 ? sumCosine / pairwiseAgreements.length : 1;

  // Rank values by cross-model spread (max - min)
  const divergences = SCHWARTZ_CIRCUMPLEX_AXES.map((axis) => {
    const scoresByModel: Record<string, number> = {};
    const vals: number[] = [];
    for (const mp of modelProfiles) {
      const s = mp.profile.scores[axis.id]?.ipsativeScore ?? 0;
      scoresByModel[mp.modelId] = s;
      vals.push(s);
    }
    const minScore = vals.length > 0 ? Math.min(...vals) : 0;
    const maxScore = vals.length > 0 ? Math.max(...vals) : 0;
    const spread = maxScore - minScore;

    return {
      valueId: axis.id,
      name: axis.name,
      scoresByModel,
      minScore,
      maxScore,
      spread,
    };
  }).sort((a, b) => b.spread - a.spread);

  const meanSpread =
    divergences.reduce((acc, d) => acc + d.spread, 0) / divergences.length;

  return {
    meanPairwiseCosine,
    meanSpread,
    pairwiseAgreements,
    divergences,
  };
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
