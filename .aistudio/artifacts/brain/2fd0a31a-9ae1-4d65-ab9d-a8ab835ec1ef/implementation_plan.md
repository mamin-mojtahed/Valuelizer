# Graph-Header "Preview Sum" Toggle & Rate-Limit Considerate Progressive Processing

Relocating the execution controls from the stream header to the graph top bar as a compact **"Preview Sum"** background overlay toggle, combined with rate-limit considerate progressive chunked processing for both real-time playback and full debate background evaluation.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions were confirmed and revised per user feedback:
> - **Control Placement & Naming**: The previous "Sync to Playback vs. Process All" toggle is removed from the stream header (CSS Selector 1) and transformed into a compact icon button labeled **"Preview Sum"** in the top bar of the radar circumplex graph (CSS Selector 2).
> - **Display Behavior**: The **"Preview Sum"** toggle controls whether only the present-moment radar map is shown or if the final cumulative sum radar map is overlaid in the background as a faint, dashed polygon with matching speaker colors (`#06B6D4` and `#F59E0B`).
> - **Rate-Limit Guardrails**: Progressive throttled chunking with adaptive pacing delays (300–450ms) between batches to guarantee zero 429 rate limit errors while smoothly streaming background sentence evaluations until the complete debate profile is ready.

---

### 1. Overview & Core Concept

- **What It Does**: 
  - Users scrubbing through a video see their live present-moment values evolve on the circumplex radar.
  - Toggling the new **"Preview Sum"** compact button in the graph top bar overlays a faint, dashed polygon of the speaker's final cumulative debate profile behind the solid live present-moment polygon.
  - Background processing runs in a polite, rate-limit considerate queue that prioritizes playback turns first, then progressively processes upcoming debate turns in throttled chunks without hitting Gemini embedding API quotas.
- **Key Value**:
  - Eliminates visual clutter in the left video panel by consolidating graph visual layers directly on the radar console.
  - Provides instant contextual comparison: users can simultaneously observe where a speaker stands *right now* relative to their overall rhetorical sum.
  - Prevents API rate-limiting crashes and quota exhaustion through controlled, pacing-aware background evaluation.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Live Scrubbing with Real-Time Circumplex**:
   - As video plays, the solid radar polygon reflects the cumulative value profile up to `currentTime`.
2. **Activating the "Preview Sum" Overlay**:
   - In the graph header toolbar (CSS Selector 2), the user clicks the new compact **"Preview Sum"** button (featuring a layered circumplex icon with a dashed indicator).
   - The graph instantly reveals a faint, dashed perimeter representing the speaker's final debate profile (with soft $15\%$ fill opacity and matching cyan/amber strokes).
   - If the debate has not been completely processed yet, the status bar quietly indicates background progressive evaluation without blocking video playback.
3. **Paced Rate-Limit Processing**:
   - Newly ingested videos are processed in progressive batches of 15–20 utterances with 350ms pacing delays.
   - If a Gemini rate-limit signal is ever approached, exponential backoff engages automatically on the server, ensuring graceful degradation and zero dropped turns.

#### Visual Hierarchy & Styling Rules
- **Stream Header Cleanliness (CSS Selector 1)**: Replaces the bulky two-button segmented toggle with a clean, unboxed playback indicator and active sentence counter.
- **Graph Top Bar Compact Control (CSS Selector 2)**: Adds a sleek button labeled **"Preview Sum"** styled with `border border-slate-700 bg-[#07090E] hover:border-cyan-500/50 text-xs font-mono`, with active state highlighted by a cyan phosphor indicator (`text-cyan-400 bg-cyan-500/10`).
- **Circumplex Layer Distinction**:
  - *Active Present Polygon*: High-contrast solid stroke (`stroke-2`), filled at $28\%$ opacity.
  - *Final Sum Ghost Polygon*: Faint dashed stroke (`stroke-[1.5] stroke-dasharray="4 3"`), filled at $8\%$ opacity, rendered strictly behind the active polygon.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Relocating the Mode Switch & Naming It "Preview Sum"**
  - *Chosen Approach*: Place the control directly in the radar circumplex header with the clean label "Preview Sum".
  - *Why*: The previous toggle in the stream header falsely implied a mode switch in video playback, when the user's true goal is previewing the final cumulative sum of values as a background reference frame on the graph itself.
- **Decision 2: Progressive Throttled Chunking vs. Eager Full-Batch Fire**
  - *Chosen Approach*: Paced progressive queue (batches of 15–20 with 300–450ms sleep).
  - *Why*: Direct batch embedding of 80+ sentences at once risks immediate 429 quota exhaustion on Gemini API keys. Pacing keeps throughput steady, respects per-minute rate limits, and allows immediate caching.
- **Decision 3: Faint Dashed Ghost Layer vs. Side-by-Side Dual Radars**
  - *Chosen Approach*: Direct overlay with dashed perimeter and low opacity.
  - *Why*: Overlaying directly on the same circumplex allows instant visual diffing between present rhetoric and overall debate trajectory without splitting attention across separate canvases.

---

### 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GRAPH TOP BAR (Selector 2)                      │
│   [Both | S1 | S2]   [Save to Vault]   [Preview Sum: Active / Off]     │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │
                                     │ toggles showPreviewSum
                                     │
┌────────────────────────────────────┴───────────────────────────────────┐
│                          RADAR CIRCUMPLEX                              │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │  Background Layer: Final Sum Profile (Faint, Dashed, 8%)     │     │
│   │  Foreground Layer: Present Moment Profile (Solid, 28%)       │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Implementation Steps
1. **Left Panel Stream Header (`src/App.tsx`, CSS Selector 1)**:
   - Remove the `Sync to Playback` vs `Process All (Fast Batch)` toggle block.
   - Streamline into a clean, unboxed status row displaying current playhead timestamp and active sentence count.
2. **Graph Top Bar (`src/App.tsx`, CSS Selector 2)**:
   - Add state `showPreviewSum: boolean` (defaulting to true so users immediately benefit from the dual comparison).
   - Insert the compact icon button (`Layers` icon with dashed sub-indicator, labeled **"Preview Sum"**) in the graph header toolbar.
3. **Radar Polygon Layer Generation (`src/App.tsx` & `src/components/RadarCircumplex.tsx`)**:
   - When `showPreviewSum` is true and `currentTime < activeDebate.durationSeconds`, generate two sets of layers:
     - `sumLayers`: Speaker profiles computed with `effectiveCutoffTime = undefined`, styled with `dashed: true`, `opacity: 0.4`, and `ghost: true`.
     - `liveLayers`: Speaker profiles computed with `effectiveCutoffTime = currentTime`, styled as solid foreground polygons.
   - Pass both into `RadarCircumplex`, rendering ghost polygons underneath foreground polygons.
4. **Rate-Limit Aware Progressive Batching (`server.ts` & `src/services/embeddingService.ts`)**:
   - In `server.ts`: Implement request pacing (chunk size 20, delay 350ms) and retry with exponential backoff for 429 responses in `/api/embed`.
   - In `embeddingService.ts`: Report progressive chunk completion so UI updates smoothly without freezing the dev server or browser.
