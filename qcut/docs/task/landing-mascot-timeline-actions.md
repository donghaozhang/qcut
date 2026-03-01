# Landing Page Mascot + Timeline Actions Plan

## Goal

Add a simple cartoon robot mascot above the timeline decoration that performs two visible AI actions in sequence, each producing a real change on the timeline below.

## Design

### Mascot Character

A small SVG robot face (~48x48px) positioned above the timeline, left-aligned. Minimal design:
- Round head with two dot eyes and a small smile
- Antenna on top (optional, adds personality)
- Monochrome white/neutral at rest, eyes glow yellow during actions
- Floating speech/thought bubble appears during each action

### Action Sequence (loops every 18s, synced to playhead cycle)

The mascot performs two actions per playhead loop, timed to specific playhead positions:

#### Action 1: "Generate" (playhead at ~25%)

1. **Mascot thinks**: thought bubble appears with "..." dots animating
2. **Mascot acts**: thought bubble changes to a sparkle icon, eyes glow yellow
3. **Timeline effect**: a NEW clip fades in on an empty spot on the timeline in a **different color** (blue/cyan — `rgb(56, 189, 248)` / `sky-400`) with a scale-up + glow entrance animation
4. **Mascot rests**: bubble fades, eyes return to normal

Timing: think 1s → generate 1.5s → rest

#### Action 2: "Rough Cut" (playhead at ~60%)

1. **Mascot thinks**: thought bubble appears with scissors icon
2. **Mascot acts**: eyes glow, a brief "cut flash" line appears on the timeline
3. **Timeline effect**: 2–3 existing clips **shrink in width** (trimmed) with a quick snap animation. A small trimmed piece fades out on each side.
4. **Mascot rests**: bubble fades

Timing: think 0.8s → cut 0.5s → rest

### Timeline Changes

Extend the existing `TimelineDecoration` to support two new clip behaviors:

#### Generated Clips (new)

```ts
type TrackClip = {
  // ... existing fields
  generated?: {
    triggerAt: number;  // playhead progress % when clip appears
    color: string;      // different color, e.g., "rgb(56 189 248)"
  };
};
```

- Clip starts invisible (`opacity: 0, scale: 0.8`)
- When playhead reaches `triggerAt`, clip animates in: `opacity → baseOpacity, scale → 1` over 0.5s
- Uses the `color` field instead of default gold
- Resets to invisible when playhead loops

Add 1–2 generated clips to the CLIPS array in empty gaps on the timeline.

#### Rough-Cut Clips (new)

```ts
type TrackClip = {
  // ... existing fields
  roughCut?: {
    triggerAt: number;    // playhead progress % when cut happens
    trimmedWidth: number; // % width after trim (smaller than original)
  };
};
```

- Clip starts at normal `width`
- When playhead reaches `triggerAt`, clip width animates to `trimmedWidth` over 0.3s with `ease: "easeOut"`
- A brief white flash line appears at the cut edge
- Resets to original width when playhead loops

Tag 2–3 existing clips with `roughCut` behavior.

## File Changes

| Action | File | Description |
|--------|------|-------------|
| Create | `components/landing/mascot.tsx` | SVG robot face + thought bubble + action state machine |
| Edit | `components/landing/timeline-decoration.tsx` | Add `generated` and `roughCut` clip behaviors, export `playheadProgress` for mascot sync |
| Edit | `components/landing/hero.tsx` | Add Mascot above TimelineDecoration |

### Estimated Lines

| File | Lines |
|------|-------|
| `mascot.tsx` | ~150 |
| `timeline-decoration.tsx` | ~30 lines added (new clip behaviors) |
| `hero.tsx` | ~5 lines added |

## Implementation Steps

### Step 1: Create mascot component (`mascot.tsx`)

**Mascot SVG**: inline SVG robot face
- Round `circle` head (stroke only, white)
- Two small `circle` eyes (filled, white at rest, yellow when active)
- Small curved `path` mouth
- Optional antenna: `line` + small `circle` on top

**Thought bubble**: positioned top-right of mascot
- Small rounded rectangle with tail
- Content switches between states: "..." dots → sparkle icon → scissors icon
- Animated with `motion` (fade in/out, scale)

**State machine** (driven by playhead progress):
```
idle → thinking_generate → generating → idle → thinking_cut → cutting → idle
```

- Receives `playheadProgress` MotionValue as prop
- Uses `useAnimationFrame` to read progress and transition states
- Each state has: bubble content, eye color, duration

### Step 2: Extend timeline clips

Add to `TrackClip` type:
- `generated?: { triggerAt: number; color: string }`
- `roughCut?: { triggerAt: number; trimmedWidth: number }`

In `TimelineClip` component:
- For `generated`: track playhead, toggle visibility with fade + scale
- For `roughCut`: track playhead, animate width shrink + flash effect
- Both reset on loop (detect backward jump like existing auto-expand)

Add new clips to CLIPS array:
```ts
// Generated clip — appears at 25% progress
{ id: "gen0", track: 1, left: 36, width: 5, baseOpacity: 0.35, glow: true,
  generated: { triggerAt: 25, color: "rgb(56 189 248)" } },

// Rough-cut targets
// Tag existing c3 (track 0, left: 40, width: 20) → trimmed to 14
// Tag existing c9 (track 1, left: 58, width: 22) → trimmed to 15
```

### Step 3: Wire into hero

In `hero.tsx`, add mascot between text content and timeline:
```tsx
<div className="w-full relative">
  <Mascot playheadProgress={playheadProgress} />
  <TimelineDecoration playheadProgress={playheadProgress} />
</div>
```

This requires lifting `playheadProgress` up from `TimelineDecoration` to the parent. Create the MotionValue + animation frame in the hero, and pass it down to both Mascot and TimelineDecoration.

## Design Tokens

| Element | Value |
|---------|-------|
| Mascot head | `stroke: white`, `fill: none` |
| Mascot eyes (rest) | `fill: white` |
| Mascot eyes (active) | `fill: #EAB308` (yellow-500) |
| Thought bubble bg | `rgba(255,255,255,0.1)` |
| Thought bubble border | `rgba(255,255,255,0.2)` |
| Generated clip color | `rgb(56 189 248)` (sky-400) |
| Generated clip glow | `0 0 10px rgba(56,189,248,0.4)` |
| Cut flash | `bg-white/60`, 0.2s fade |

## Animation Timeline (per 18s loop)

```
0%  ──────── 20% ─── 25% ────── 35% ──────── 55% ─── 60% ──── 65% ──── 100%
│            │       │          │            │       │        │         │
│  idle      │ think │ generate │  idle      │ think │  cut   │  idle   │
│            │  ...  │  ✨ clip │            │  ✂️   │ shrink │         │
│            │       │  fades in│            │       │ clips  │         │
```

## No New Dependencies

All SVG + `motion` animations. No external icon library needed — mascot and icons are inline SVG paths.
