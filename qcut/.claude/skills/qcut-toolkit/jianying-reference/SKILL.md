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
- **Node-graph format** (partial): `textAnim.lsproj` + `studioAnim.lsanim` +
  `res/`. Node params and `paramsKeyFrames` are readable JSON (glow curves,
  selector ranges); the per-char driver script `res/*.jsdat` is encrypted —
  fall back to frame captures for the motion itself.
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
NEW=$(find . -maxdepth 1 -type d -newer "$SCRATCH/.marker" | grep -v '^\.$' | head -1)
INNER=$(find "$NEW" -maxdepth 1 -type d | tail -1)
mkdir -p "$SCRATCH/<effect-name>" && cp -r "$INNER"/* "$SCRATCH/<effect-name>/"
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
   precedent: Jianying's typewriter slotting `(rank+1)/(unitCount+1)` is
   implemented in `evaluate.ts` (`typewriterUnitProgress`), and
   `EASE_OUT_QUAD` in `effects.ts` mirrors `Amaz.Ease.quadOut`.
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
   normalized times as the Jianying captures.

## Scope Notes

- Works identically for filters (see the LUT-fitting playbook in project
  memory), transitions, and stickers — only the panel and the package contents
  differ.
- `Cache/effect` only contains effects that have been applied at least once on
  this machine; apply the card once to force the download.
- Read-only analysis of locally cached files for interop/parity purposes; do
  not redistribute Jianying's assets or ship any harvested content in QCut.
