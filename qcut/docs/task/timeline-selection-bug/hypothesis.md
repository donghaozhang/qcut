# Timeline clip click-to-select not working

**Symptom (user-reported):** Left-clicking a clip on the timeline no longer selects it. Console contains no selection-related logs (no errors from `timeline-element` / `timeline-track`).

## Flow being exercised

```
User presses mouse on clip
  └─ React onMouseDown fires at timeline-element.tsx:570
       └─ timeline-track.tsx::handleElementMouseDown (L425)
             ├─ setMouseDownLocation({x,y})
             └─ startDragAction(elementId, trackId, ...)   ← always, every click
                  └─ store: dragState.isDragging = true    ← state change → re-render

  (isDragging=true triggers the useEffect at timeline-track.tsx:100 which
   installs window-level mousemove / mouseup listeners)

User releases mouse
  └─ window mouseup → handleMouseUp (L194)
       ├─ may call updateElementStartTime(...)
       └─ endDragAction()                                  ← isDragging = false, re-render

  React onClick fires on the clip div
  └─ timeline-track.tsx::handleElementClick (L464)
       ├─ e.stopPropagation()
       ├─ delta check (skip if > 5px)
       ├─ skip if modifier key pressed
       └─ selectElement(track.id, element.id, false)       ← THE actual selection
```

## Hypotheses (ranked)

### 1. React `onClick` never fires because the subtree re-renders between mousedown and mouseup
Every mousedown calls `startDragAction`, which flips `dragState.isDragging` → true. React re-renders the clip. On mouseup, `endDragAction` flips it back → another re-render. Two re-renders in the short window between mousedown and click can cause React to drop the synthetic `click` event on the replaced DOM node. This would match the symptom exactly — no logs, no selection, no error.

**Likely fix:** defer `startDragAction` until the mouse actually moves past the 5 px threshold (instead of firing it on mousedown).

### 2. `handleMouseUp` in the useEffect commits an update that shifts the element
`handleMouseUp` at L194 always calls `updateElementStartTime(..., dragState.currentTime)` when the user releases. If `currentTime` was snapped to a slightly different value at startDrag time, the clip briefly moves, React re-renders the whole track, and the click lands on nothing.

**Test:** verify `dragState.currentTime` at mouseup when the user didn't move.

### 3. `dragState.isDragging` stuck `true` from a prior interaction
If an earlier drag ended on an invalid drop target (outside any track), `endDragAction` may not have run. Subsequent mousedowns see `isDragging` already true, which can skew the useEffect and the click handler behaviour.

**Test:** log the dragState transitions; look for `isDragging=true` before any click.

### 4. Recent iPad touch commit (089776472) switched some handlers to pointer events
Resize handles already use `onPointerDown` (L590, L597). If the main clip body is implicitly receiving pointer capture somehow (via `touch-action: none` on ancestors or a pointerdown listener further up), the browser may not emit a subsequent click. Less likely since `onClick` here is still a React synthetic.

## Why the console is silent

Neither `handleElementMouseDown` nor `handleElementClick` nor the store's `selectElement` currently has any log statement. So we can't distinguish between "handler fired but early-returned" and "handler never fired" from the console.

**Next step:** add console.log at the entry of each handler + inside `selectElement`, reproduce, and read the log order. That will immediately tell us which of the hypotheses above is correct.
