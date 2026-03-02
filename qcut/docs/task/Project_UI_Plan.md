# Project Dashboard UI Overhaul — Implementation Plan

**Goal**: Transform the projects page from a flat file browser into an AI Studio Dashboard.
**Source file**: `apps/web/src/routes/projects.lazy.tsx` (612 lines)
**Principle**: Long-term maintainability > scalability > performance > short-term gains

---

## Summary of Changes

The current projects page is clean but emotionally flat — it feels like a file browser, not an AI video control center. This plan addresses 12 improvement areas grouped into 7 implementation subtasks, ordered by dependency and impact.

---

## Subtask 1: Extract ProjectCard into its own component

**Why**: The `ProjectCard` is defined inline (lines 320–548, ~230 lines) inside `projects.lazy.tsx`. Extracting it is prerequisite for all card improvements and keeps the route file under 800 lines after we add new features.

**Files**:
- `apps/web/src/components/project/project-card.tsx` — **new** (extract from route)
- `apps/web/src/routes/projects.lazy.tsx` — remove inline definition, import component

**Work**:
- Move `ProjectCard` + its types/props to dedicated file
- Move `formatDate` helper alongside it or into a shared util
- Keep all existing functionality (selection mode, dropdown menu, thumbnail loading)
- No behavior changes — pure extraction

**Tests**:
- `apps/web/src/components/project/__tests__/project-card.test.tsx` — **new**
- Renders project name, date, thumbnail
- Dropdown menu actions (rename, duplicate, delete) fire callbacks
- Selection mode shows checkbox, applies ring style

**Estimate**: ~15 min

---

## Subtask 2: Enhance Project Card depth & hover (points 6, 10)

**Why**: Cards are flat (`border-none`, no shadow). Hover just reduces opacity to 65%. Cards should feel like media, not folders.

**Files**:
- `apps/web/src/components/project/project-card.tsx` — modify card styles
- `apps/web/src/routes/projects.lazy.tsx` — update grid item wrapper if needed

**Work**:
- Add subtle elevation shadow: `shadow-sm hover:shadow-md` with `transition-shadow`
- Replace `group-hover:opacity-65` with upward lift: `hover:-translate-y-1 transition-transform duration-200`
- Add `16:9` aspect ratio option for thumbnail (configurable, default keep square)
- Add duration label overlay (bottom-right of thumbnail) — pull from project timeline data if available
- Add "AI Generated" badge if project contains AI-generated media items
- Entry animation: `motion/react` fade + translateY on mount (staggered per card)

**Tests**:
- Duration label renders when timeline has duration
- AI badge renders when project has AI media
- Hover classes are applied correctly

**Estimate**: ~25 min

---

## Subtask 3: Unified control bar + button hierarchy (points 5, 9)

**Why**: Search bar and sort dropdown are visually separated. "New Project" and "Select Projects" have equal visual weight. Need one dominant CTA.

**Files**:
- `apps/web/src/routes/projects.lazy.tsx` — restructure header/controls section

**Work**:
- Group search input + sort dropdown into a single flex row with consistent styling (e.g. shared border or background strip)
- "New Project" button: switch to `variant="primary"` (yellow/brand), add `Plus` icon
- "Select Projects" button: switch to `variant="text"` or `variant="outline"` (subtle secondary)
- Add filter chips below control bar (optional, only if project count > 5): "All", "Recent", "AI Generated"

**Tests**:
- Update existing rendering tests if any exist for the projects page
- Verify button variants render correctly

**Estimate**: ~15 min

---

## Subtask 4: Improved empty state & emotional anchor (points 7, 11)

**Why**: Current empty state is a plain `Video` icon + "No projects yet" text. Needs to inspire action and convey the AI-native identity.

**Files**:
- `apps/web/src/routes/projects.lazy.tsx` — update `NoProjects` inline component
- `apps/web/src/components/project/empty-state.tsx` — **new** (if complex enough to extract)

**Work**:
- Replace generic message with branded copy:
  - Heading: "Start your first AI-powered video"
  - Subtext: "Create a project to begin editing with AI assistance"
- Add subtle animated gradient or pulsing ring around the CTA button
- "New Project" CTA in empty state uses `variant="primary"` with glow effect
- When projects exist: show count as `"N projects"` near the title — not clickable filter (keep it simple), just informational
- New Project tile in the grid: replace gray camera placeholder with a styled creation tile:
  - Dashed border, `+ Create New Project` text, subtle hover glow
  - Use `border-dashed border-2 border-muted-foreground/30 hover:border-primary/50` pattern

**Tests**:
- `apps/web/src/components/project/__tests__/empty-state.test.tsx` — **new**
- Empty state renders with correct copy
- CTA button triggers project creation

**Estimate**: ~20 min

---

## Subtask 5: Rename section & layout centering (points 1, 2)

**Why**: "Your Projects" is generic. Grid collapses left with few projects. Need brand-specific naming and balanced layout.

**Files**:
- `apps/web/src/routes/projects.lazy.tsx` — update title, layout classes

**Work**:
- Rename "Your Projects" to "Studio" (short, brand-aligned, cinematic)
- When only 1–2 projects exist, center the grid content: add `justify-center` or switch to flex layout at low counts
- Always show the "Create New Project" tile as the last grid item (ensures grid never has just one lonely card)
- Consider `max-w-5xl` instead of `max-w-6xl` to reduce perceived emptiness on wide screens

**Tests**:
- Title text renders as "Studio"
- Create tile always appears in grid

**Estimate**: ~10 min

---

## Subtask 6: AI presence indicator (point 4)

**Why**: The dashboard feels static. The "Agent OS" identity is invisible. Need a subtle AI presence signal.

**Files**:
- `apps/web/src/components/project/ai-status-indicator.tsx` — **new**
- `apps/web/src/routes/projects.lazy.tsx` — add indicator to header area
- `apps/web/src/stores/project-store.ts` — optionally add last-activity metadata

**Work**:
- Add a minimal AI status line in the header area (near title):
  - `"AI Ready"` with a small green dot — default state
  - Later: can show "Processing..." if any AI task is running (hook into generation stores)
- Keep this **very simple** in v1 — a static badge is fine. Dynamic status can come later once we have cross-project AI task tracking
- Use `Badge` component with `variant="outline"` + custom dot indicator
- Do NOT build a full "Agent Activity" widget yet — that's a separate feature

**Tests**:
- `apps/web/src/components/project/__tests__/ai-status-indicator.test.tsx` — **new**
- Renders "AI Ready" text with indicator dot
- Applies correct color class

**Estimate**: ~10 min

---

## Subtask 7: Template section (point 8)

**Why**: An AI-native editor should offer quick-start templates. This makes the page feel intelligent and reduces friction for new users.

**Files**:
- `apps/web/src/components/project/template-gallery.tsx` — **new**
- `apps/web/src/routes/projects.lazy.tsx` — add section below project grid
- `apps/web/src/types/project.ts` — add template preset type if needed

**Work**:
- Add "Start from Template" section below the projects grid
- 4 template cards in a horizontal scroll or grid row:
  - **Social Reel** (9:16, 1080x1920, 30fps)
  - **YouTube Video** (16:9, 1920x1080, 30fps)
  - **Product Demo** (16:9, 1920x1080, 30fps)
  - **AI Avatar** (9:16, 1080x1920, 30fps)
- Each template: icon + name + aspect ratio label
- On click: calls `createNewProject` with template-specific `canvasSize` and `canvasMode`
- Templates are hardcoded data (no backend/storage needed)
- Section hidden when user has 5+ projects (they know what they're doing)

**Tests**:
- `apps/web/src/components/project/__tests__/template-gallery.test.tsx` — **new**
- Renders all 4 templates
- Click creates project with correct canvas size
- Section not rendered when project count >= 5

**Estimate**: ~25 min

---

## Implementation Order

```
Subtask 1 (extract card)         — prerequisite for 2
    ↓
Subtask 2 (card depth/hover)     — depends on 1
    ↓
Subtask 3 (control bar)          — independent
Subtask 4 (empty state)          — independent
Subtask 5 (rename/layout)        — independent
Subtask 6 (AI indicator)         — independent
    ↓
Subtask 7 (templates)            — do last, most new code
```

Subtasks 3–6 are independent and can be done in any order or in parallel.

---

## Total Estimate

~2 hours of implementation across 7 subtasks.

## Files Changed (summary)

| File | Action |
|------|--------|
| `apps/web/src/routes/projects.lazy.tsx` | Major refactor — extract card, restructure layout, add sections |
| `apps/web/src/components/project/project-card.tsx` | **New** — extracted card component |
| `apps/web/src/components/project/empty-state.tsx` | **New** — branded empty state |
| `apps/web/src/components/project/ai-status-indicator.tsx` | **New** — AI ready badge |
| `apps/web/src/components/project/template-gallery.tsx` | **New** — template quick-start section |
| `apps/web/src/types/project.ts` | Minor — template preset type |
| `apps/web/src/components/project/__tests__/project-card.test.tsx` | **New** — card tests |
| `apps/web/src/components/project/__tests__/empty-state.test.tsx` | **New** — empty state tests |
| `apps/web/src/components/project/__tests__/ai-status-indicator.test.tsx` | **New** — AI indicator tests |
| `apps/web/src/components/project/__tests__/template-gallery.test.tsx` | **New** — template tests |

## Out of Scope (future work)

- Full "Agent Activity" dashboard widget with running tasks
- Dynamic AI status (requires cross-project task tracking infrastructure)
- Animated timeline background in empty state
- Project thumbnail auto-capture (already exists via timeline store)
- Filter chips beyond basic search (wait for user feedback)
