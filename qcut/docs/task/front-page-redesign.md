# Front Page Redesign Plan

## Goal

Redesign the QCut landing page from the current minimal text hero to a cinematic, dark-themed landing page inspired by the reference screenshot — featuring bold Chinese/English headlines, CTA buttons, and a decorative timeline visualization.

## Reference Design Analysis

The target design has:
1. **Full black background** — not the current `bg-background` with theme toggle
2. **Large bold headline**: "AI Native Video Editing"
3. **Subtitle**: "Built for the Agent Era"
4. **Description text**: A single line of English copy
5. **Two CTA buttons** side by side:
   - Gold/yellow primary button (left) — "Start Creating"
   - Dark/gray outlined secondary button (right) — "Learn More"
6. **Decorative timeline visualization** at the bottom:
   - Stylized audio waveforms in gold/amber
   - Glowing clip thumbnails with grid/pixel patterns
   - A vertical playhead line with a bright glowing point
   - Dark timeline tracks with subtle grid lines

## Current State

| File | Role |
|------|------|
| `apps/web/src/routes/index.tsx` | Route — renders Header, Hero, Footer |
| `apps/web/src/components/landing/hero.tsx` | Current hero — "The AI native / Content Creation" with Handlebars |
| `apps/web/src/components/landing/handlebars.tsx` | Draggable text reveal effect |
| `apps/web/src/components/header.tsx` | Header with logo, blog link, projects button |
| `apps/web/src/components/footer.tsx` | Footer with links and GitHub stars |

**Available libraries**: `motion` (v12.34.2) for animations. No canvas/WebGL libraries installed.

## Implementation Plan

### Step 1: Create timeline decoration component

**New file**: `apps/web/src/components/landing/timeline-decoration.tsx`

An animated, decorative timeline at the bottom of the hero. Built with CSS/SVG + `motion` (no canvas).

#### Static Structure

- **3–4 horizontal tracks**, each with a very faint segmented background (subtle dashed/dotted dividers between segments, ~`border-neutral-900` or `opacity-[0.06]` borders)
- **Clips** scattered across tracks as rectangular blocks with gold/amber tones at low opacity (~20-40%). Some clips are short, some long, with small gaps between them
- **Waveform shapes** inside some clips using SVG paths (gold gradient, low opacity)
- Responsive — scales down gracefully on mobile
- `aria-hidden="true"` (purely decorative)

#### Clip Glow

Some clips have a subtle steady glow (`box-shadow: 0 0 8px rgba(234,179,8,0.3)`) to feel "active". These are pre-selected at random positions to give visual variety even before the playhead reaches them.

#### Playhead

- A thin vertical line (`w-px`, white or gold, ~`opacity-60`) spanning all tracks
- A bright glowing dot at the base (`w-2 h-2 rounded-full bg-yellow-500` with `box-shadow` glow)
- Positioned with CSS `left` driven by a `motion` value

#### Dynamic Behavior (motion animations)

1. **Playhead crawl**: The playhead moves slowly left → right across the full timeline width over ~15–20s, then loops. Use `motion.div` with `animate={{ x: [0, containerWidth] }}` and `transition={{ duration: 18, repeat: Infinity, ease: "linear" }}`.

2. **Clip highlight on playhead pass**: Each clip tracks the playhead position. When the playhead `x` overlaps a clip's horizontal range, the clip briefly brightens:
   - Opacity ramps from base (~0.25) to bright (~0.7) over 0.3s, then fades back over 0.8s
   - `box-shadow` intensifies during highlight
   - Implementation: each clip reads the playhead `MotionValue` via `useMotionValueEvent` or `useTransform` and toggles a `highlighted` state

3. **Auto-generate expand**: 1–2 designated clips "grow" when the playhead reaches them:
   - The clip's width animates from a short size to a longer size (`motion.div` with `animate={{ width }}`)
   - A subtle shimmer/scan-line sweeps across the expanding clip (CSS `background: linear-gradient(...)` with `background-position` animation)
   - This simulates "AI auto-generating" content on the timeline
   - Triggers once per loop when playhead enters the clip's start position
   - Expansion takes ~1.5s with `ease: "easeOut"`

#### Data Model

```ts
type TrackClip = {
  id: string;
  track: number;        // 0-3
  left: number;         // % from left edge
  width: number;        // % of total width
  baseOpacity: number;  // 0.2–0.4
  glow: boolean;        // pre-lit clip
  autoExpand?: {
    initialWidth: number;  // % before expand
    expandedWidth: number; // % after expand
  };
};
```

Clips are defined as a static array (~10-15 clips). No randomization at runtime — deterministic layout for consistent rendering.

### Step 2: Redesign the hero component

**Edit file**: `apps/web/src/components/landing/hero.tsx`

Replace the current hero with:

```
┌─────────────────────────────────────────────┐
│                                             │
│       AI Native Video Editing               │  ← Bold, white, ~4rem
│       Built for the Agent Era               │  ← Medium, white/gray, ~2rem
│                                             │
│  Create, edit, and automate video with AI   │  ← Muted text, ~1rem
│  agents — all in one powerful desktop app.  │
│                                             │
│    ┌──────────────┐  ┌──────────────┐       │
│    │ Start Creating│  │  Learn More  │       │  ← Gold + Dark buttons
│    └──────────────┘  └──────────────┘       │
│                                             │
│  ═══════════════════════════════════════════ │  ← Timeline decoration
│  ▓▓▓░░▓▓▓▓▓▓░░░▓▓▓▓▓▓▓▓▓░░▓▓▓▓░░░░▓▓▓▓▓▓ │
│  ░▓▓▓▓░░░░░▓▓▓▓▓░░░░░░▓▓▓▓▓▓░░░░▓▓▓▓▓▓░░ │
└─────────────────────────────────────────────┘
```

Changes:
- Background: `bg-black` (always dark, no theme toggle impact)
- Remove `Handlebars` import — the timeline decoration replaces it as the visual hook
- All English copy
- Staggered `motion` fade-in + slide-up for each text block
- Two CTA buttons:
  - Primary: gold bg (`bg-yellow-500`), dark text, "Start Creating" → `/projects`
  - Secondary: dark bg with border (`border-neutral-600`), light text, "Learn More" → blog
- `TimelineDecoration` at the bottom, fading in last

### Step 3: Update the header for dark landing page

**Edit file**: `apps/web/src/components/header.tsx`

- Make header transparent/overlay on the landing page (position over hero)
- Text color: white (since background is always black on landing)
- Keep logo, blog link, projects button
- Remove or hide ThemeToggle on landing page (the page is always dark-themed)

Alternative: keep header as-is but pass a `variant="dark"` prop. The landing-specific header sits inside the hero with absolute positioning and transparent bg.

### Step 4: Simplify the index route

**Edit file**: `apps/web/src/routes/index.tsx`

- Keep Header + Hero + Footer structure
- Wrap everything in a `bg-black` container to enforce dark theme on this page
- Footer can be simplified or hidden since the timeline fills the bottom

### Step 5: Clean up unused handlebars

**Delete file**: `apps/web/src/components/landing/handlebars.tsx` (if no longer used anywhere)

## File Changes Summary

| Action | File | Lines (est.) |
|--------|------|-------------|
| Create | `components/landing/timeline-decoration.tsx` | ~120 |
| Rewrite | `components/landing/hero.tsx` | ~80 |
| Edit | `components/header.tsx` | ~10 lines changed |
| Edit | `routes/index.tsx` | ~5 lines changed |
| Delete | `components/landing/handlebars.tsx` | -105 |

## Design Tokens

| Element | Value |
|---------|-------|
| Background | `#000000` (pure black) |
| Headline | `#FFFFFF` bold |
| Subtitle | `#E5E5E5` or `text-neutral-200` |
| Description | `#999999` or `text-neutral-500` |
| Primary button bg | `#EAB308` (`yellow-500`) |
| Primary button text | `#000000` |
| Secondary button bg | transparent |
| Secondary button border | `#525252` (`neutral-600`) |
| Secondary button text | `#E5E5E5` |
| Timeline glow | `#EAB308` with `box-shadow` / `drop-shadow` |
| Clip blocks | `#EAB308` at 60-80% opacity with grid pattern |
| Waveform | `#EAB308` at 40-60% opacity |

## Animations (using `motion`)

1. **Headline**: fade in + slide up, 0.3s delay
2. **Subtitle**: fade in + slide up, 0.5s delay
3. **Description**: fade in, 0.7s delay
4. **Buttons**: fade in + slide up, 0.9s delay
5. **Timeline**: fade in from bottom, 1.1s delay
6. **Playhead glow**: continuous pulse animation (infinite)
7. **Clip shimmer**: subtle left-to-right shimmer on clips (CSS animation)

## Open Questions

1. **Footer**: Keep the current footer below the timeline, or let the timeline be the page bottom?
2. **Mobile layout**: Stack buttons vertically? How much of the timeline to show?

## No New Dependencies

Everything can be built with existing `motion` + Tailwind CSS + SVG. No new packages required.
