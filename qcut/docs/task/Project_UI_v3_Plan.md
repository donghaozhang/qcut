# Project Dashboard UI v3 — Refinement Plan

**Goal**: Push from "polished beta" (80%) to "premium creative system" (95%) — atmosphere, depth, warmth, subtle motion.
**Nature**: Refinement, not restructuring. All changes are CSS/style tweaks to existing components.
**Principle**: Long-term maintainability > scalability > performance > short-term gains

---

## Summary

The v3 feedback identifies 5 refinement areas. We address them through 4 focused subtasks (points 4+5 are already partially addressed by existing `StudioBackground` and `RecentActivity` — they just need polish).

---

## Subtask 1: Warm cinematic glow — replace electric blue (point 2)

**Why**: The current glow uses `--primary` which is electric blue (`hsl(205, 84%, 53%)`) in dark mode. This feels "developer-tool-ish". QCut's identity is cinematic — should use a warm amber/gold edge light instead.

**Files**:
- `apps/web/src/globals.css` — change `glow-pulse` and `glow-tile` from `oklch(from var(--primary)...)` to a warm amber color
- `apps/web/src/components/project/create-project-tile.tsx` — update border and icon colors from `primary` to amber

**Work**:
- Define a warm glow color: `hsl(38 90% 55%)` (amber/gold) — used only in the glow animation, not replacing the system `--primary`
- Update `.glow-tile` box-shadow from `oklch(from var(--primary)...)` to explicit amber: `hsla(38, 90%, 55%, 0.15)` → `hsla(38, 90%, 55%, 0.25)`
- Update `.glow-tile:hover` box-shadow to `hsla(38, 90%, 55%, 0.35)`
- In `create-project-tile.tsx`: change `border-primary/20` → `border-amber-500/20`, `bg-primary/10` → `bg-amber-500/10`, `text-primary` → `text-amber-400`
- The "New Project" header button stays blue (primary) — only the in-grid creation tile gets the warm glow

**Tests**:
- No test changes needed — tests verify text content, not color classes

**Estimate**: ~10 min

---

## Subtask 2: Project card depth — noise texture, vignette, hover reveal (point 3)

**Why**: Thumbnail placeholders (gray `bg-muted/50` with a Video icon) look like empty UI slots. They should feel like media previews even when empty. Cards with real thumbnails also need more visual depth.

**Files**:
- `apps/web/src/components/project/project-card.tsx` — add vignette overlay, improve hover
- `apps/web/src/globals.css` — add `.card-vignette` CSS class

**Work**:
- Add a CSS vignette overlay inside the thumbnail area: `box-shadow: inset 0 0 30px rgba(0,0,0,0.3)` via a `.card-vignette` class. This gives depth to both placeholder and real thumbnails.
- Improve empty thumbnail placeholder: replace plain `bg-muted/50` with a subtle radial gradient (`bg-gradient-to-br from-muted/60 to-muted/30`) so it looks less flat
- Add hover reveal: on hover, thumbnail gets a subtle brightness boost (`group-hover:brightness-110` via Tailwind `filter` utilities)
- Add `updatedAt` relative time below the date: show "Edited 2h ago" alongside "Created Jan 5, 2025" to give a sense of project freshness
- Reduce spinner size for loading state (h-8 → h-6 for a more refined feel)

**Tests**:
- No new test file needed — existing card test already covers render behavior

**Estimate**: ~15 min

---

## Subtask 3: Studio background — add radial gradient for focal depth (point 4)

**Why**: The animated grid alone is very subtle (`opacity-[0.03]`). Adding a faint radial gradient creates a "center of gravity" — the eye naturally lands on the center-top of the page where the project grid sits.

**Files**:
- `apps/web/src/components/project/studio-background.tsx` — add radial gradient layer

**Work**:
- Add a second `div` layer inside `StudioBackground`: a radial gradient (`radial-gradient(ellipse at 50% 30%, ...)`) from a very faint primary/amber tint to transparent
- Use `opacity-[0.04]` for the gradient — barely visible, but provides directional warmth
- This creates the "cinematic environment" feel without any JS or animation cost

**Tests**:
- Existing test checks render + `pointer-events-none` — still passes, no changes needed

**Estimate**: ~5 min

---

## Subtask 4: Activity strip — add subtle pulse indicator (point 5)

**Why**: The Recent Activity strip shows text data, but it feels static. Adding a tiny animated dot (like the AI Ready indicator) next to the first activity item gives a sense of "the system is alive".

**Files**:
- `apps/web/src/components/project/recent-activity.tsx` — add pulse dot before the first item

**Work**:
- Before the first activity item, render a small `2px` animated dot (reusing the same ping pattern from `AiStatusIndicator`)
- Use `bg-green-500` with `animate-ping` inner circle — same pattern, tiny size
- Only show when there are activity items (not in empty state)
- This is a 3-line change — minimal but impactful

**Tests**:
- No test changes needed — the dot is decorative

**Estimate**: ~5 min

---

## Implementation Order

All 4 subtasks are independent — no dependencies between them.

```
Subtask 1 (warm glow)           — CSS + 1 component
Subtask 2 (card depth)          — 1 component + CSS
Subtask 3 (radial gradient)     — 1 component
Subtask 4 (activity pulse)      — 1 component
```

---

## Total Estimate

~35 minutes across 4 subtasks.

## Files Changed (summary)

| File | Action |
|------|--------|
| `apps/web/src/globals.css` | Change glow colors to amber, add `.card-vignette` class |
| `apps/web/src/components/project/create-project-tile.tsx` | Amber color scheme for tile border/icon |
| `apps/web/src/components/project/project-card.tsx` | Vignette overlay, gradient placeholder, hover brightness, "edited ago" text |
| `apps/web/src/components/project/studio-background.tsx` | Add radial gradient layer for focal depth |
| `apps/web/src/components/project/recent-activity.tsx` | Add animated pulse dot before first item |

## Out of Scope

- Custom noise/film-grain texture (requires asset loading, not worth the complexity)
- Video thumbnail auto-play on hover (needs new infrastructure)
- Custom font or typography system (font already set via `--font-inter`)
- Redefining system `--primary` color (amber is only for the creation tile glow, not global)
