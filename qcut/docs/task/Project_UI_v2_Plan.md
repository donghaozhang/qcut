# Project Dashboard UI v2 — Implementation Plan

**Goal**: Evolve Studio from "early beta SaaS" to "Creative AI Studio OS" — add energy, depth, system signals, and emotional anchor.
**Baseline**: v1 implementation already in place (extracted components, basic animations, templates, AI badge).
**Principle**: Long-term maintainability > scalability > performance > short-term gains

---

## Summary

The v2 feedback identifies 5 high-impact gaps:
1. Page is emotionally flat — no background energy
2. "New Project" tile still feels secondary — needs glow, not dashes
3. Grid still collapses left
4. AI presence is status-only — no activity signals
5. Templates are static — need personality

This plan addresses all 5 with 5 focused subtasks.

---

## Subtask 1: Animated background grid (point 1 — "Subtle Background Motion")

**Why**: The page is neutral dark with no visual anchor. A very faint animated grid gives the Studio page a "control room" feel without competing with content.

**Files**:
- `apps/web/src/components/project/studio-background.tsx` — **new**
- `apps/web/src/routes/projects.lazy.tsx` — add background layer behind `<main>`
- `apps/web/src/globals.css` — add `@keyframes grid-pulse` animation

**Work**:
- Create a full-viewport `absolute inset-0 pointer-events-none overflow-hidden` layer
- Render a CSS-only animated grid using `background-image: linear-gradient` (horizontal + vertical lines)
- Very low opacity (`opacity-[0.03]`), slow pulse animation (30s cycle), subtle `background-position` shift via CSS keyframes
- No canvas, no SVG, no JS animation — pure CSS for zero performance cost
- Dark mode only (hide in light mode with `dark:block hidden`)

**Tests**:
- `apps/web/src/components/project/__tests__/studio-background.test.tsx` — **new**
- Renders without errors
- Has `pointer-events-none` class (doesn't block interaction)

**Estimate**: ~10 min

---

## Subtask 2: Upgraded "New Project" tile with glow border (point 2)

**Why**: The dashed border tile looks like a placeholder, not an entry point to creation. It should be the gravitational center for new users.

**Files**:
- `apps/web/src/components/project/create-project-tile.tsx` — restyle
- `apps/web/src/globals.css` — add glow keyframe animation

**Work**:
- Replace `border-dashed border-2 border-muted-foreground/25` with solid border + animated glow
- Add CSS `@keyframes glow-pulse` — cycles `box-shadow` from `0 0 0 1px hsl(var(--primary) / 0.15)` to `0 0 12px 2px hsl(var(--primary) / 0.25)` over 3s
- Hover state: intensify glow + scale 1.02
- Plus icon gets `text-primary` by default (not just on hover)
- Text changes from "New Project" to "+ Create New Project" for stronger CTA language

**Tests**:
- Update `apps/web/src/components/project/__tests__/create-project-tile.test.tsx`
- Verify text says "+ Create New Project"

**Estimate**: ~10 min

---

## Subtask 3: Centered grid layout fix (point 3)

**Why**: With few projects, the 4-column grid collapses left leaving a void on the right. The grid needs to center when sparse.

**Files**:
- `apps/web/src/routes/projects.lazy.tsx` — adjust grid classes

**Work**:
- When project count <= 3 (including create tile): switch grid to `flex flex-wrap justify-center gap-6` with `max-w-[280px]` per item (matching grid column width)
- When project count > 3: keep current `grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6`
- Simple conditional: `const useFlex = sortedProjects.length <= 2`
- This ensures the few cards are centered, and the layout gracefully transitions to a grid as projects grow

**Tests**:
- No new test file — this is a CSS class change

**Estimate**: ~10 min

---

## Subtask 4: Recent Activity strip (point 4 — "AI Presence beyond status")

**Why**: "AI Ready" is status, not presence. The Studio should surface real activity — last render, recent generations, project freshness. This is the highest-impact change for making the page feel alive.

**Files**:
- `apps/web/src/components/project/recent-activity.tsx` — **new**
- `apps/web/src/routes/projects.lazy.tsx` — add between project grid and templates
- `apps/web/src/stores/text2image-store.ts` — read only (no changes), access `generationHistory`
- `apps/web/src/stores/export-store.ts` — read only (no changes), access `exportHistory`

**Work**:
- Create `RecentActivity` component that reads from existing stores:
  - `text2image-store.generationHistory` — count today's generations, show last generation time
  - `export-store.exportHistory` — show last render timestamp + filename
  - `project-store.savedProjects` — show most recently updated project
- Display as a compact horizontal strip with 2-3 activity items:
  - `🎬 Last render: 5m ago` (from exportHistory)
  - `✨ N AI generations today` (from generationHistory)
  - `📝 Last edited: Project Name` (from savedProjects sorted by updatedAt)
- Each item is a `<span>` with icon + text, separated by a subtle `·` divider
- If no activity exists (fresh install): show `"No recent activity — create your first project to get started"`
- Use `text-xs text-muted-foreground` styling — informational, not attention-grabbing
- Relative time formatting: use simple helper (`< 1m ago`, `5m ago`, `2h ago`, `yesterday`, date)

**Tests**:
- `apps/web/src/components/project/__tests__/recent-activity.test.tsx` — **new**
- Renders "No recent activity" when stores are empty
- Renders generation count when history exists
- Formats relative time correctly

**Estimate**: ~25 min

---

## Subtask 5: Smart template hints (point 5)

**Why**: Static template tiles feel generic. Adding dynamic hints ("Trending format", "Agent-ready") gives personality and makes the section feel intelligent.

**Files**:
- `apps/web/src/components/project/template-gallery.tsx` — add hint badges

**Work**:
- Add `hint` field to `ProjectTemplate` type:
  - Social Reel: `"Trending format"`
  - YouTube Video: `"Optimized for retention"`
  - Product Demo: `"Presentation-ready"`
  - AI Avatar: `"Agent-ready"`
- Render hint as a small `text-[10px] text-primary/70 font-medium uppercase tracking-wider` line below the description
- Subtle — not a badge, just a tiny label that adds personality

**Tests**:
- Update `apps/web/src/components/project/__tests__/template-gallery.test.tsx`
- Verify hints render for each template

**Estimate**: ~10 min

---

## Implementation Order

```
Subtask 1 (background grid)      — independent
Subtask 2 (create tile glow)     — independent
Subtask 3 (centered grid)        — independent
Subtask 4 (recent activity)      — independent
Subtask 5 (template hints)       — independent
```

All subtasks are independent and can be done in any order.

---

## Total Estimate

~65 minutes across 5 subtasks.

## Files Changed (summary)

| File | Action |
|------|--------|
| `apps/web/src/routes/projects.lazy.tsx` | Add background layer, centered grid logic, activity strip |
| `apps/web/src/globals.css` | Add `grid-pulse` and `glow-pulse` keyframe animations |
| `apps/web/src/components/project/studio-background.tsx` | **New** — CSS animated grid background |
| `apps/web/src/components/project/create-project-tile.tsx` | Restyle with glow border + stronger CTA text |
| `apps/web/src/components/project/recent-activity.tsx` | **New** — activity strip reading from existing stores |
| `apps/web/src/components/project/template-gallery.tsx` | Add hint labels per template |
| `apps/web/src/components/project/__tests__/studio-background.test.tsx` | **New** |
| `apps/web/src/components/project/__tests__/recent-activity.test.tsx` | **New** |
| `apps/web/src/components/project/__tests__/create-project-tile.test.tsx` | Update for new text |
| `apps/web/src/components/project/__tests__/template-gallery.test.tsx` | Update for hint labels |

## Data Sources (read-only, no store changes)

| Store | Field | Used For |
|-------|-------|----------|
| `text2image-store` | `generationHistory[].createdAt` | "N AI generations today" |
| `export-store` | `exportHistory[].timestamp` | "Last render: Xm ago" |
| `project-store` | `savedProjects[].updatedAt` | "Last edited: Project Name" |

## Out of Scope (future v3)

- Scheduled jobs / background task monitoring
- Full Agent Activity widget with running task list
- Video preview thumbnails auto-play on hover
- Project-level AI usage breakdown
- Personalized template recommendations
