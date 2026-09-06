# Cover Parity Pass 3: Iceland Sideways Text and Preview Space

Date: 2026-09-06. Branch: `codex/cover-design`; existing PR #463.

## Changes

The Iceland template previously failed the blanket vertical-typesetting check. In the native Jianying cover editor, its left-side `TRAVEL WITH FRIENDS` line is turned clockwise. QCut now maps verified plain ASCII vertical runs to the existing editable text rotation, adding 90 degrees to the source segment rotation and normalizing the result.

Original content, trailing newline, cached fonts, colors, normalized anchors and layer order remain intact. This is editable text, not a flattened image. CJK, mixed scripts, combining characters, emoji, and vertical native word-art effects remain explicitly unsupported.

Text dimensions and rotation now live in an icon-triggered popover with sliders and bounded numeric fields. It supports keyboard activation, Escape, busy states and layer changes without dismissing the cover editor. Desktop tools and the filmstrip are more compact. At 1136×676 with Iceland's side text selected, preview height increases from 169px to 280px, approximately 66%, while retaining all controls and the ten-frame strip.

## Actual Verification

Both applications used the same `source-frame.jpg` with a centered portrait crop. Native Jianying was used only for temporary cover editing and cancelled afterwards. QCut used an isolated test profile and project.

Real package: `814ffb9c88f94377add6086eddd23366`. Three text layers: the side caption, `Iceland Vlog`, and `冰岛旅行`. All three fonts were loaded from QCut's private cache.

The 1080×1920 PNG SHA-256 values match across save, reload and reopen:

| Version | SHA-256 |
| --- | --- |
| Original text, including restoring it after the edit | `94e22d1a201c7dc0f3ac466a9fbf4f5c6884892e04080dc5b33c79c3aa665255` |
| Edited to `TRAVEL WITH QCUT` | `01f654a968120b102d3716d850a104a762e8fefd5b2758464d700a21656cc61a` |

The saved design was read back: one background, three editable text layers, a 90-degree side caption and retained local-font references. Checks covered 1136×676, 790×760, 390×844 and 1440×900, horizontal overflow, loaded images and all ten filmstrip frames. The geometry popover stays inside the 390px viewport.

Artifacts and replay scripts:

`/Users/peter/Desktop/qcut-cover-comparison-2026-09-06/parity-pass-3/`

- `index.html`: native reference, QCut before/after, narrow UI and actual output.
- `ui-audit.cjs` and `ui-evidence.json`: UI actions, persisted design and output hashes.
- `iceland-verification.json`: receipt bound to the real cache fingerprint.

## Cache Accounting

No new templates were acquired in this pass. The existing subset remains eight discovered and eight cached templates. Text-layout applicability improves from seven to eight; actual render/save/reopen verification improves from three to four after adding Iceland.

The existing collection audit validates cached objects, prepares text layouts, imports the receipt and synchronizes the main cache and SSD backup:

```text
~/Library/Application Support/QCut/PrivateAssets/JianyingCover
/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover
```

Original definitions are unchanged. Private fonts, previews, packages and binaries are excluded from Git.

## Remaining Gaps

“Verified” means text-layout rendering and save/reopen, not full-template or pixel parity. Iceland still lacks the `filter/77a842c891a712e7569d6799d631bf46` background dependency. QCut preserves the user's background; a similarly named filter is not substituted. Five historical background-filter gaps remain across the subset.

Same-source screenshots still show font-size, letter-spacing and glyph-metric differences, especially in the side caption. This pass enables the correct direction and editable application, not complete typography equivalence. Editing the imported caption into CJK produces ordinary rotated text, not a native CJK vertical-layout engine.

The native cover subwindow is accessible in this pass, superseding the earlier access blocker. Full per-category pagination and collection were not performed; eight observed samples are not the complete catalog.

Validation: 222 relevant tests across 21 files, Web TypeScript and Electron main-process build passed. Initial screenshot attempts timed out with docked DevTools; after closing DevTools in the test window, the UI audit was rerun successfully. Failed attempts are not counted as screenshot evidence.
