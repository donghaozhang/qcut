# Properties / Export / Settings Panel Consolidation

## Current State

The right sidebar has **3 tabs** managed by `PanelTabs`:

| Tab | Content | File |
|-----|---------|------|
| **Properties** | Element-specific controls (text, media, audio, markdown, remotion, transform, effects). When nothing selected: project info (name, aspect ratio, resolution, FPS) | `properties-panel/index.tsx` (227 lines) |
| **Export** | Full export workflow — presets, filename, quality, engine, format, details, captions, audio | `export-dialog/export-dialog.tsx` + sub-components |
| **Settings** | 3 sub-tabs: Project Info, Background, API Keys | `properties-panel/settings-view.tsx` (742 lines) |

### Settings Sub-tabs Breakdown

| Sub-tab | Content | Lines (approx) |
|---------|---------|-----------------|
| Project Info | Name, aspect ratio, FPS dropdowns | 90–167 |
| Background | Blur previews (3 levels), color grid + pipette | 169–295 |
| API Keys | 5 key inputs with show/hide, test buttons, save, status badges | 297–741 |

## Problems

### 1. Duplicated Project Info
Project info appears in **two places**:
- Properties tab empty state (lines 67–114 in `index.tsx`) — shows name, aspect ratio, resolution, FPS
- Settings > Project Info sub-tab (lines 90–167 in `settings-view.tsx`) — shows name, aspect ratio, FPS

The Properties empty view is read-only for aspect ratio/resolution. The Settings version has editable dropdowns. Users may not realize they need to go to Settings to change values they see in Properties.

### 2. API Keys Don't Belong in a Panel Tab
API keys are a **one-time setup** task. Having them as a persistent sub-tab alongside project settings wastes space and adds cognitive load. They also make up ~60% of `settings-view.tsx`.

### 3. settings-view.tsx is Nearly at the 800-line Limit
At 742 lines, any additions will push it over. The file mixes three unrelated concerns.

### 4. Background Settings Are Disconnected
Background blur/color is a visual property of the project canvas but lives under a "Settings" tab, separate from the canvas preview.

---

## Proposal: Consolidate to 2 Tabs + 1 Modal

### Tab 1: Properties (keep, enhanced)

Merge Project Info and Background into the Properties tab empty state:

```
Properties tab (nothing selected):
├── Project Information (collapsible, editable)
│   ├── Name
│   ├── Aspect Ratio (dropdown)
│   ├── Resolution (display)
│   └── Frame Rate (dropdown)
└── Background (collapsible)
    ├── Blur (3 levels)
    └── Color (grid + pipette)

Properties tab (element selected):
├── Element-specific controls (unchanged)
└── Transform/Effects (unchanged)
```

**Why**: Project info and background are both "canvas-level properties." When no element is selected, the Properties panel should show everything about the canvas itself. This removes duplication and makes the background discoverable.

### Tab 2: Export (keep as-is)

No changes. Export is a focused workflow with its own presets, quality, format, and progress tracking. It works well as a dedicated tab.

### API Keys: Move to Modal Dialog

Extract API keys into a standalone modal accessible from:
- Header menu bar (Settings > API Keys)
- A gear icon / button in the Properties panel footer

**Why**: API keys are configured once and rarely revisited. A modal is the standard UX pattern for credential management (VS Code, Figma, etc.).

---

## Alternative: Keep 3 Tabs, Just Reorganize

If removing the Settings tab feels too aggressive:

| Tab | Content |
|-----|---------|
| Properties | Element properties + project info/background when nothing selected |
| Export | Unchanged |
| Settings | API Keys only (rename tab to "API Keys" or keep "Settings") |

This still eliminates the Project Info duplication and moves Background to where it makes sense.

---

## Implementation Checklist

### If going with 2 tabs + modal:

- [ ] Move `ProjectInfoView` into Properties empty state (replace the read-only version)
- [ ] Move `BackgroundView` into Properties empty state as a second collapsible group
- [ ] Extract `ApiKeysView` into `components/api-keys-dialog.tsx`
- [ ] Add modal trigger to header or panel footer
- [ ] Remove Settings tab from `PanelTabs`
- [ ] Update `PanelView` type (remove `SETTINGS`)
- [ ] Delete or gut `settings-view.tsx`

### If going with reorganized 3 tabs:

- [ ] Move `ProjectInfoView` + `BackgroundView` into Properties empty state
- [ ] Remove Project Info and Background sub-tabs from Settings
- [ ] Settings tab becomes API Keys only (simpler, no sub-tabs needed)
- [ ] Rename Settings tab to "API Keys" in `PanelTabs`
- [ ] Refactor `settings-view.tsx` — extract `ApiKeysView` to its own file

### Either way (shared cleanup):

- [ ] Remove duplicate project info from Properties empty state (`index.tsx` lines 67–114)
- [ ] Extract repetitive API key input pattern into a reusable `ApiKeyField` component
- [ ] Ensure `settings-view.tsx` stays well under 800 lines after refactor

---

## Files Affected

| File | Change |
|------|--------|
| `properties-panel/index.tsx` | Replace empty state with editable project info + background |
| `properties-panel/settings-view.tsx` | Extract API keys, remove project/background sections |
| `properties-panel/panel-tabs.tsx` | Remove or rename Settings tab |
| `types/panel.ts` | Update `PanelView` enum |
| `stores/export-store.ts` | Update `panelView` type if Settings removed |
| New: `api-keys-dialog.tsx` or `api-keys-view.tsx` | Extracted API key management |
| New: `api-key-field.tsx` | Reusable input component for API keys |

## Decision Needed

Which approach?
1. **2 tabs + modal** — cleanest UX, API keys in a dialog
2. **3 tabs reorganized** — less disruptive, Settings becomes "API Keys"
3. **Keep as-is** — just fix the duplication and split the file
