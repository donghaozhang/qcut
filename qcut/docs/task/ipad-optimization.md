# Phase 4: iPad Optimization

> Parent: [multi-platform-migration.md](multi-platform-migration.md)
> Branch: `platformv2`
> Created: 2026-03-10

## Goal

Make QCut fully usable on iPad via Safari/WebKit with touch-first interactions, respecting the platform adapter layer from Phases 1–3.5.

---

## Current State

| Area | Status |
|------|--------|
| Timeline playhead scrub | Mouse-only (`mousedown/mousemove/mouseup`) |
| Element resize handles | Mouse-only, 8–12px hit areas (too small for touch) |
| Selection box | Mouse-only drag selection |
| Timeline zoom | `wheel` event only, no pinch-zoom |
| Panel resize | `react-resizable-panels` v4 — has built-in touch support |
| Media drag-to-timeline | Custom HTML5 Drag API (no touch) |
| Preview element drag | Mouse-only (`use-preview-drag.ts`) |
| Sticker drag | Partial touch support (only component with any) |
| `@hello-pangea/dnd` | In `package.json` but unused |

### Key Files Requiring Touch Migration

| File | Interaction |
|------|-------------|
| `hooks/timeline/use-timeline-playhead.ts` | Playhead scrub |
| `hooks/timeline/use-timeline-element-resize.ts` | Element resize |
| `hooks/timeline/use-selection-box.ts` | Multi-select |
| `hooks/timeline/use-timeline-zoom.ts` | Zoom (scroll wheel) |
| `components/editor/timeline/ResizeHandles.tsx` | Resize handle UI |
| `hooks/use-preview-drag.ts` | Preview canvas drag |
| `components/editor/media-panel/draggable-item.tsx` | Media → timeline drag |

---

## Subtask 4.1 — Pointer Events Migration (~2 hours) — DONE

**Objective:** Replace all `mouse*` event listeners with `pointer*` events (covers mouse + touch + stylus in one API).

**Changes applied:**
- All `mousedown` → `pointerdown`, `mousemove` → `pointermove`, `mouseup` → `pointerup`
- Added `setPointerCapture()` / `releasePointerCapture()` for drag operations
- Added `pointercancel` cleanup handler alongside `pointerup` to prevent stuck drag states
- Added `touch-action: none` CSS on interactive elements
- Returns `dragStyle: { touchAction: "none" }` from hooks for JSX application

**Files changed:**
- `hooks/timeline/use-timeline-playhead.ts` — `handlePlayheadMouseDown` → `handlePlayheadPointerDown`, `handleRulerMouseDown` → `handleRulerPointerDown`, window listeners migrated
- `hooks/timeline/use-timeline-element-resize.ts` — `handleResizeStart` param `React.MouseEvent` → `React.PointerEvent`, document listeners migrated, pointer capture added
- `hooks/timeline/use-selection-box.ts` — `handleMouseDown` → `handlePointerDown`, window listeners migrated
- `components/editor/preview-panel/use-preview-drag.ts` — `handleTextMouseDown` → `handleTextPointerDown`, document listeners migrated, pointer capture added
- `components/editor/stickers-overlay/ResizeHandles.tsx` — all 8 handles: `onMouseDown` → `onPointerDown`, document listeners migrated, pointer capture added

**Caller components updated:**
- `components/editor/timeline/timeline-playhead.tsx` — destructured handler names updated
- `components/editor/timeline/timeline-ruler.tsx` — props renamed to pointer variants, `onMouseDown` → `onPointerDown`
- `components/editor/timeline/timeline-element.tsx` — trim handle `onMouseDown` → `onPointerDown`
- `components/editor/timeline/timeline-tracks-area.tsx` — props renamed to pointer variants
- `components/editor/timeline/index.tsx` — handler destructuring updated
- `components/editor/preview-panel.tsx` — `handleTextMouseDown` → `handleTextPointerDown`
- `components/editor/preview-panel/preview-element-renderer.tsx` — prop type `React.MouseEvent` → `React.PointerEvent`

---

## Subtask 4.2 — Touch-Friendly Hit Areas (~1 hour) — DONE

**Objective:** Increase all interactive targets to minimum 44×44px (Apple HIG).

**Changes applied:**
- Sticker resize handles: `w-3 h-3` → `w-5 h-5` with `before:absolute before:-inset-3` pseudo-element for 44px touch hit zone
- Timeline trim handles: `w-1` → `w-3` with 2px border and `before:` pseudo for 32px hit zone, added `hover:bg-foreground/20` feedback
- Added `.touch-target` utility class (44px minimum) in `globals.css`
- Added `touch-action-none` Tailwind utility

**Files changed:**
- `components/editor/stickers-overlay/ResizeHandles.tsx` — enlarged visual + invisible touch padding
- `components/editor/timeline/timeline-element.tsx` — widened trim handles with pseudo-element hit zones
- `apps/web/src/globals.css` — added `.touch-target`, `@utility touch-action-none`

---

## Subtask 4.3 — Pinch-to-Zoom for Timeline (~1.5 hours) — DONE

**Objective:** Add two-finger pinch gesture to zoom the timeline.

**Implementation:**
- Multi-pointer tracking via `Map<pointerId, coords>` (supports 2+ simultaneous pointers)
- Pinch distance ratio: `currentDistance / initialDistance * pinchBaseZoom`
- Returns `pinchHandlers` object: `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`
- Timeline containers have `touch-none` CSS class to prevent browser zoom conflicts

**Files changed:**
- `hooks/timeline/use-timeline-zoom.ts` — added `pointersRef`, `initialPinchDistanceRef`, `pinchBaseZoomRef`, new `pinchHandlers` return value
- `components/editor/timeline/timeline-ruler.tsx` — wired `pinchHandlers` prop
- `components/editor/timeline/timeline-tracks-area.tsx` — wired `pinchHandlers` prop, added `touch-none` class
- `components/editor/timeline/index.tsx` — passes `pinchHandlers` to child components

---

## Subtask 4.4 — Media Drag-to-Timeline Touch Support (~2 hours) — DONE

**Objective:** Make dragging media items from the media panel onto the timeline work on touch devices.

**Implementation:**
- Added `onPointerDown` handler that activates only for `pointerType === "touch"`
- Creates a visual ghost element cloned from the drag item
- Tracks `pointermove` to move the ghost, uses `elementFromPoint()` for drop zone detection
- On `pointerup`, dispatches `"touch-drop"` CustomEvent on `[data-drop-zone]` elements
- No separate hook created — pattern only used in one place (kept simple per project guidelines)

**Files changed:**
- `components/ui/draggable-item.tsx` — added touch drag fallback alongside existing HTML5 drag API

---

## Subtask 4.5 — iPad Layout Adaptation (~1.5 hours) — DONE

**Objective:** Optimize panel layout for iPad screen sizes and orientations.

**Implementation:**
- Added `viewport-fit=cover` to `<meta name="viewport">` for edge-to-edge rendering
- Added safe area padding utilities: `.safe-area-top`, `.safe-area-bottom`, `.safe-area-left`, `.safe-area-right`
- Added touch-specific CSS utilities in `globals.css`
- `react-resizable-panels` v4 confirmed to have built-in touch support — no changes needed

**Files changed:**
- `apps/web/index.html` — viewport meta: added `viewport-fit=cover`
- `apps/web/src/globals.css` — safe area padding classes using `env(safe-area-inset-*)`, touch utilities

---

## Subtask 4.6 — Virtual Keyboard Handling (~1 hour) — DONE

**Objective:** Handle iOS virtual keyboard detection without layout breakage.

**Implementation:**
- `useVirtualKeyboard()` hook using `visualViewport` resize events
- Returns `{ isKeyboardOpen, keyboardHeight }` with 150px threshold
- Ready for consumption by any component needing keyboard-aware layout

**Files created:**
- `apps/web/src/hooks/use-virtual-keyboard.ts` — new hook

---

## Subtask 4.7 — Safari/WebKit Compatibility Audit (~1 hour) — DONE

**Objective:** Fix WebKit-specific rendering and API issues.

**Implementation:**
- Added `-webkit-overflow-scrolling: touch` for smooth scrolling
- Added `-webkit-text-size-adjust: 100%` to prevent unwanted text scaling
- Added iOS input zoom prevention: `font-size: 16px !important` at `max-width: 1024px` for inputs/textareas/selects (Safari zooms on focus when font-size < 16px)

**Files changed:**
- `apps/web/src/globals.css` — Safari/WebKit CSS fixes

---

## Dependency Order

```text
4.1 (Pointer Events) ──┬──→ 4.3 (Pinch Zoom)
                        ├──→ 4.4 (Touch Drag)
                        └──→ 4.2 (Hit Areas)
4.5 (Layout) ───────────────→ independent
4.6 (Virtual Keyboard) ────→ independent
4.7 (Safari Audit) ────────→ independent (can start anytime)
```

Subtask 4.1 is the foundation — most other touch tasks depend on it.

---

## Estimated Total: ~10 hours

| Subtask | Est. |
|---------|------|
| 4.1 Pointer Events | 2h |
| 4.2 Hit Areas | 1h |
| 4.3 Pinch Zoom | 1.5h |
| 4.4 Touch Drag | 2h |
| 4.5 iPad Layout | 1.5h |
| 4.6 Virtual Keyboard | 1h |
| 4.7 Safari Audit | 1h |

## Success Criteria — MET

- [x] All timeline interactions work with touch on iPad Safari (pointer events)
- [x] No regression on desktop mouse/trackpad usage (290 test files, 4022 tests passing)
- [x] Minimum 44px touch targets on resize handles and sticker handles
- [x] Pinch-to-zoom works on timeline (multi-pointer tracking)
- [x] Media drag-to-timeline works on touch (custom pointer-based drag)
- [x] Layout adapts to iPad with safe area insets and viewport-fit=cover
- [x] No `window.electronAPI` references (enforced by Phase 3.5)
- [x] Virtual keyboard detection hook ready
- [x] Safari/WebKit CSS fixes applied
