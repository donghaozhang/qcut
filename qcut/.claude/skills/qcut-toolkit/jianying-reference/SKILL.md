---
name: jianying-reference
description: Reverse-engineer how Jianying (剪映专业版) implements an effect — text animations, filters, transitions, stickers — by harvesting its on-disk effect packages (TextAnim.lua, config.json, node-graph lsproj) and capturing stepped reference frames from its UI, then porting the exact math into QCut and locking it with tests. Use for 剪映对标, 对齐剪映, 剪映参照, 剪映动画怎么实现的, 逆向剪映特效, matching Jianying behavior, or verifying a QCut effect against Jianying frame by frame.
---

# Jianying Reference Harvesting

Get the *authoritative* implementation of a Jianying effect instead of guessing
from pixels. Every effect the user has ever applied is cached on disk as a full
package — often with readable Lua source that states the exact easing, distances,
and per-character timing. Combine that with stepped-frame captures from the UI
and you have both the math and the visual ground truth.

Two evidence tiers, always collect both when possible:

1. **Effect package source** (exact math, when the package is legacy Lua format)
2. **Stepped-frame captures** (visual ground truth, works for every format)

## Key Paths

```text
~/Movies/JianyingPro/User Data/Cache/effect/        # one dir per effect package
~/Movies/JianyingPro/User Data/Projects/            # drafts (encrypted in new versions)
```

Each package: `effect/<numeric-id>/<md5-hash>/` containing one of:

- **Legacy Lua format** (goldmine): `TextAnim.lua`, `Transform.lua`,
  `PrinterOne.lua`, `EnlargeIn.lua`, `BounceIn.lua`, … plus `config.json`,
  `anim.prefab`. The Lua declares tweens explicitly:
  `tween:fromTo(obj, {alpha=0}, {alpha=1}, dur, Amaz.Ease.quadOut, ...)`.
- **Node-graph format** (partial → often better than it looks): `textAnim.lsproj`
  + `studioAnim.lsanim` + `res/`. The driver (`.lsproj`, `res/*.jsdat`) is
  encrypted, but three readable layers usually remain:
  1. **`res/` node names** expose the effect graph — e.g. 粒子碎落 =
     `LinearWipe` + `Dust` + `DeepGlowSimple`, which is the architecture.
  2. **Compiled shader products are PLAINTEXT** even when `.ausl` sources are
     encrypted: read `…/xshader/shaderLib/shaderMetal/*.vert|*.frag` (or
     `shaderGLES/`). For GPU-particle effects the entire closed-form motion
     lives in the vertex shader (instanceID → noise sample → offset ×
     release-front weight + rotated gravity) — a line-by-line whitebox.
  3. **`strings` on `.prefab` files** yields the full emitter parameter
     schema (`particleTotalNum`, `pSize*`, `pOpacityOverLife`, `gravity`,
     `gravityRot`, `emitterScale/Translation`, `pLifeRandom`, …); calibrate
     the numeric values from stepped frames.
  Only fall back to pure frame captures when all three layers come up empty.
- AE-keyframe hybrids: `TextAnim.lua` that samples baked curves via
  `self.Position:getCurPartVal(progress)` — curve data lives in sibling JSON;
  treat as node-graph tier.

## Step 1 — Map an effect card to its package (mtime marker)

Package dirs are numeric ids with no name field, and drafts are encrypted, so
map UI card → package by modification time:

```bash
SCRATCH=<scratch-dir>/jy-anim; mkdir -p "$SCRATCH"
touch "$SCRATCH/.marker"
# ... apply exactly ONE effect in the Jianying UI ...
cd "$HOME/Movies/JianyingPro/User Data/Cache/effect"
NEW=$(find . -maxdepth 1 -type d -newer "$SCRATCH/.marker" ! -name . | head -1)
# An already-cached effect downloads nothing, so an empty result is normal —
# bail instead of letting "$NEW"/* expand to /* and copy the filesystem root.
if [ -z "$NEW" ]; then
  echo "no new package: this effect was already cached (harvest impossible)"
else
  INNER=$(find "$NEW" -mindepth 1 -maxdepth 1 -type d | head -1)
  if [ -z "$INNER" ]; then
    echo "unexpected layout under $NEW"
  else
    mkdir -p "$SCRATCH/<effect-name>"
    cp -R "$INNER/." "$SCRATCH/<effect-name>/"
  fi
fi
touch "$SCRATCH/.marker"   # reset for the next effect
```

Apply → harvest → reset, one effect at a time. Never batch-apply then guess.

## Step 2 — Read the Lua for exact semantics

Worked examples decoded this way (text animations):

| Effect | File | Authoritative math |
|---|---|---|
| 打字机 I | `PrinterOne.lua` | char *i* alpha 0→1, duration `dur·i/(N+1)`, `Ease.Floor` → hard step at `(i)/(N+1)`; nothing at t=0, all visible at `N/(N+1)` |
| 向上滑动 | `Transform.lua` | whole block, `localPosition` from `(0, −2.66·textureH/screenH)` → 0 ⇒ **1.33 × block height**, `quadOut`; alpha 0→1 `quadOut` |
| 放大 | `EnlargeIn.lua` | `localScale` 0.5→1.0 `quadOut`, alpha `quadOut`, no overshoot |
| 弹入 | `BounceIn.lua` | elastic-out `exp(−7t)·sin((t−0.075)·2π/0.3)+1` |
| 打字机光标 | `TextAnim.lua` + sprite | cursor is a **solid block sprite**, solid while typing, gone at end; per-char times from a random table |

Conventions to know when reading:
- `localPosition` Y is in half-screen units: offset_px = value × screenH / 2.
- `Amaz.Ease.Floor` = pure step at tween end (this is how typewriters "蹦字").
- `seek(time)`/`setDuration` mean every tween is scrubbed, so formulas are exact
  at any frame — no integration drift.

## Step 3 — Stepped-frame capture protocol (UI)

Precision rules learned the hard way:

1. **Move the text element past the video's end** so the player shows it on
   black; snap-drag its left edge near the video end.
2. Find the element's first frame: click the ruler past it, press `↑`
   (previous edit point) — the timecode (bottom-left, e.g. `01:24:33:04`) is
   your F0 anchor. Verify it after EVERY apply.
3. Apply the effect card, then **wait ≥3 s** — applying auto-plays a preview.
   Before stepping, confirm the transport shows **▶ (stopped)**, not ⏸.
   A ⏸ means your frames are contaminated by live playback — redo.
   **Loop animations are the exception**: Jianying does not evaluate 循环
   animations while paused-and-stepping — stepped frames come back as static
   text. Capture loops by playing and pausing (space → wait a fraction of the
   cycle → space); the paused frame keeps the loop pose frozen and can be
   screencaptured cleanly.
4. Step with `→` (1 frame each), capture a tight zoom of the player region at
   every 2–3 frames across the whole duration (default 0.5 s = 15 frames
   @30fps). Capture one frame past the end for the steady state.
5. Record the 动画时长 field right after applying — that's the preset's default
   duration and should match QCut's `defaultDuration`.
6. Re-selecting: clicking an animation card only applies when the element is
   still selected. If the panel click did nothing, re-click the element first.
7. Never use cmd+z chains to reset state (undo-stack desync) — delete and
   re-add instead. Beware other windows stealing frontmost focus mid-batch.

Longer text reveals stagger better: use ~12 mixed CJK+ASCII graphemes like
`剪映动画测试ABC123`.

## Step 4 — Port to QCut and verify frame-by-frame

QCut's text-animation engine lives in
`packages/editor-core/src/text-animation/` (compile → evaluate, pure functions)
with presets in `apps/web/src/lib/text/text-animation-presets/`.

1. Translate the Lua math into effect params / easing / stagger. Notable
   precedents: Jianying's typewriter slotting `(rank+1)/(unitCount+1)` is
   implemented in `evaluate.ts` (`typewriterUnitProgress`), and
   `EASE_OUT_QUAD` in `effects.ts` mirrors `Amaz.Ease.quadOut`. For loop
   animations, QCut treats sequence stagger as a **cyclic phase offset**
   (`phaseUnitProgress` with `wrap`), which is how per-char sin/cos channels
   with rank-spread phases become Jianying's ring layouts; orbit's `ring`
   mode additionally cancels each unit's layout offset so every glyph rides
   one centered circle (环绕). Do not trust preset names — 空间翻转 III is a
   planar rotate oscillation, not a flip.
2. Verify numerically before trusting pixels — evaluate the compiled animation
   at every frame and compare against the Lua formula:

```ts
// bun script: expected visible chars per frame for 打字机 I
const jy = (f: number) => Math.min(N, Math.floor(Math.min(1, f / F) * (N + 1)));
// evaluateTextAnimationFrame(...) at each frame must match jy(f) exactly
```

3. Lock the semantics with unit tests in
   `packages/editor-core/src/__tests__/` (see
   "reveals typewriter units on Jianying's (rank+1)/(count+1) slots").
4. For visual confirmation inside QCut, drive the real editor:
   `bun run build && bun run electron`, then `bun run pipeline
   editor:project:create / editor:timeline:apply / editor:timeline:seek` with a
   manifest generated from the real preset helpers
   (`applyTextAnimationPreset`), and screenshot the preview at the same
   normalized times as the Jianying captures. Gotchas: the editor API listens
   on port 8765 (`QCUT_API_PORT=8765` if discovery picks the wrong port);
   `editor:timeline:apply --verify` compares JSON strings, so preset effect
   objects must emit keys in the normalizer's order or verification fails on
   a semantically identical animation.

## Capture Traps

- A fully occluded Electron window stops rendering; window-id screencapture
  (`screencapture -l <id>`) then returns a stale backing store. Keep the
  window on a visible display (move it with System Events if the user is
  working on the main one) before seek-and-capture.
- Directory names lie: `AmazingFeature_particle` in several packages is a
  noise-grain shader, not a particle emitter. Verify by reading the shader,
  not the folder name.
- The panel window can get resized between sessions — re-anchor card
  coordinates from a fresh screenshot instead of reusing yesterday's grid.
- `screencapture -l <windowID>` pads the image with the window shadow, and
  the margin CHANGES with focus state (focused windows cast bigger shadows)
  — a mapping calibrated on one capture silently drifts on the next. Prefer
  a display-rect capture (`screencapture -R -1920,0,1920,1080`) of only the
  display Jianying is on: pixel == global coordinate, stable, and it cannot
  photograph the user's other displays.
- `cliclick` treats a negative coordinate as a RELATIVE move unless prefixed
  with `=` (`c:=-654,160`). On a display left of main, un-prefixed clicks
  land at arbitrary offsets and look like the app "ignored" them.
- macOS keeps re-fronting the Claude app between tool calls. Start every
  interaction batch with `set frontmost of process "VideoFusion-macOS"`,
  verify frontmost, and do all clicks/keys inside that same shell call.
- Frame stepping: `cliclick kp:arrow-left` mostly gets swallowed by
  Jianying; System Events `key code 123/124` with ~0.3s delays is reliable
  and frame-exact (verify by cropping the player timecode).
- Jianying ignores every synthetic scroll injection (line, pixel, phased
  trackpad CGEvents, drag-scroll) — deep list items are unreachable by
  scrolling. Use the animation panel's magnifier search instead: click it,
  `osascript -e 'set the clipboard to "彩带喷射"'`, Cmd+V, Return.
  (`printf | pbcopy` yields mojibake — always set the clipboard via
  AppleScript for CJK.)
- NEVER send Cmd+A unless a text field is visibly focused: if the search
  box closed itself, Cmd+A selects every timeline clip and a follow-up
  Delete wipes the project (Cmd+Z recovers — check the timeline crop
  immediately after any destructive-capable keystroke).
- Re-applying an already-cached effect leaves ZERO disk trace (no new files
  anywhere under `Cache/`), so an mtime marker proves nothing either way —
  only the card's download arrow disappearing confirms the apply.
- Not everything is procedural: 彩带喷射 ships a side-by-side alpha MP4
  (left=matte right=color) plus a RadialBlur node, and 福袋炸开 composites
  prerendered 3D assets. Check `find <pkg> -name "*alpha*.mp4"` before
  hunting for emitter math; if the reference is baked footage, port a
  procedural approximation and record it as a known difference.

## Scope Notes

- Works identically for filters (see the LUT-fitting playbook in project
  memory), transitions, and stickers — only the panel and the package contents
  differ.
- `Cache/effect` only contains effects that have been applied at least once on
  this machine; apply the card once to force the download.
- Read-only analysis of locally cached files for interop/parity purposes; do
  not redistribute Jianying's assets or ship any harvested content in QCut.
- That rule covers the **repo**, not just the product: never commit decompiled
  shaders, `strings` dumps, prefab blobs, or frames extracted from their bundled
  media. Transcribe the behaviour into your own equations/prose in the task doc
  and leave the raw files in the session scratch dir. Screenshots of on-screen
  output for side-by-side comparison are fine.
