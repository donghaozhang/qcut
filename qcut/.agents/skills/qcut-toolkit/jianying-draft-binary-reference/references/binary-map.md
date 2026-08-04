# Jianying draft binary map

## Scope and versioning

This map describes locally observed Jianying Professional behavior on macOS.
The strongest snapshot was collected on 2026-08-04 from a build identifying
itself as `JIANYING_PC/11.2.0-beta5`. Re-run the checks after every Jianying
update: paths, symbols, encryption envelopes, and service boundaries can move.

Canonical locations:

```text
Application:  /Applications/VideoFusion-macOS.app
Project root: ~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft
```

## Current ownership map

| Component | Current responsibility | Evidence | Confidence |
| --- | --- | --- | --- |
| `libvideoeditor.dylib` | Core draft/timeline model, JSON patch/deserialization, timeline opening, and crypto key-store integration | `lvve::Draft::patch_from_json`, `lvve::MaterialDraft::patch_from_json`, `lyra::ProjectImpl::openTimeline`, `openTimelineEditor`, `draft_info.json`, `draft_content.json`, `CryptoKeyStoreIO`, `ICryptoKeyStore`, `CryptoKeyStoreHolder`, `CryptoKeyVEAdaptor` | static-strong |
| `libVECreator.dylib` | High-level project manager and business orchestration for local load/save, autosave, subdrafts, cloud transfer, repair, and telemetry | `draft_load_local`, `lvmiddlelayer_draft_deserialize`, `pc_draft_auto_save`, `write_draft_content_error_code`, `sub_draft_async_load`, `debug_encrypt_draft_enable`, `/draft_content.json` | static-strong |
| `VideoFusion-macOS` | Main UI/launcher shell that links the creator and editor layers | imports and links to creator/editor frameworks | architecture-only |
| `VideoFusion-macOS --lvve-service` | Background editor service; observed loading the same creator/editor libraries | running process and loaded-library inventory | architecture-only until a file-access trace ties it to an operation |
| `libvecryptor.dylib` | Generic FFmpeg/media I/O encryption and decryption helpers | `FFmpegBaseXORIOCryptor.cpp`, `FFmpegIOCryptor`, `FFmpegXORIODecryptor`, `FFmpegIOEncryptor` | static-strong for media I/O; unresolved for draft decryption |
| `VideoFusionData.framework` and `VideoFusion_macOS.framework` | App/model bridging candidates | loaded architecture; no direct draft filename hit in the inspected build | architecture-only |
| CEF, GPU, and renderer helpers | UI and rendering support | process roles | not primary draft parsers |

Do not collapse the first two rows into one claim. The available evidence
supports a layered design: `libVECreator` orchestrates project operations and
calls into `libvideoeditor`, while `libvideoeditor` owns the core draft and
timeline structures. Exact call direction still requires runtime tracing.

## Project file map

| File or directory | Observed role | Handling rule |
| --- | --- | --- |
| `draft_info.json` | Current draft body; recent files can be opaque base64-like text instead of JSON | Classify, do not overwrite or assume corrupt |
| `crypto_key_store.dat` | Project key-store sidecar referenced by editor symbols | Treat as sensitive; never print, copy into the repo, or upload |
| `subdraft/**/draft_content.json` | Plaintext JSON for nested or compound drafts in some projects | Preferred source for schema research when available |
| `.backup/**/*.load.bak` and `*.save.bak` | Mixed historical snapshots; some parse as JSON and some are opaque | Validate each file independently |
| `draft_meta_info.json` | Project-list and metadata sidecar | Do not mistake it for the complete timeline |
| `timeline_layout.json` | Timeline UI/layout state | Supporting evidence only |
| `performance_opt_info.json` | Performance/cache optimization state | Not the canonical timeline |
| `draft_biz_config.json` | Product/business configuration | Not the canonical timeline |
| `key_value.json` | Usage/category attribution and small state | Not the renderer definition |
| `.locked` | Project is open or reserved by Jianying | Stop any operation that could write or copy a changing project |

A local sample contained opaque current drafts alongside valid plaintext
subdrafts and backups. That coexistence is expected and does not prove that
the current draft is damaged.

## Read-only inspection cookbook

Set paths once:

```bash
APP="/Applications/VideoFusion-macOS.app"
PROJECT_ROOT="$HOME/Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
MAIN="$APP/Contents/MacOS/VideoFusion-macOS"
CORE="$APP/Contents/Frameworks/libvideoeditor.dylib"
CREATOR="$APP/Contents/Frameworks/libVECreator.dylib"
CRYPTOR="$APP/Contents/Frameworks/libvecryptor.dylib"
```

Record the installed build and process topology:

```bash
plutil -p "$APP/Contents/Info.plist" | rg 'CFBundle(ShortVersionString|Version)'
pgrep -fal 'VideoFusion-macOS|lvve-service'
otool -L "$MAIN" | rg 'VECreator|videoeditor|vecryptor|VideoFusion'
```

For each reported PID, inventory loaded candidate libraries:

```bash
lsof -p <pid> | rg 'libVECreator|libvideoeditor|libvecryptor|VideoFusion(Data|_macOS)'
```

Inventory project formats without reading key-store content:

```bash
find "$PROJECT_ROOT" -type f \
  \( -name 'draft_info.json' -o -name 'draft_content.json' \
     -o -name '*.load.bak' -o -name '*.save.bak' \) -print
find "$PROJECT_ROOT" -name .locked -print
```

Classify one candidate safely:

```bash
FILE="/absolute/path/to/candidate"
file "$FILE"
if jq empty "$FILE" >/dev/null 2>&1; then
  echo json
else
  echo opaque-or-non-json
fi
```

Search static evidence. Save only the command and summarized matches, not a
binary dump:

```bash
strings -a "$CORE" | rg 'draft_info|draft_content|CryptoKeyStore|openTimeline|patch_from_json'
strings -a "$CREATOR" | rg 'draft_load_local|draft_deserialize|auto_save|sub_draft|encrypt_draft'
strings -a "$CRYPTOR" | rg 'Cryptor|Decryptor|Encryptor|XOR'
nm -gjU "$CORE" 2>/dev/null | c++filt | rg 'Draft|Timeline|CryptoKeyStore'
```

For exact file ownership, a macOS filesystem trace is stronger than strings.
It may require administrator access, so ask the user first. Use a disposable
project, start the trace, perform exactly one open/save operation, then stop:

```bash
sudo fs_usage -w -f filesystem \
  | rg 'VideoFusion|draft_info|draft_content|crypto_key_store|\.load\.bak|\.save\.bak'
```

A runtime event should record timestamp, PID/process, operation, path class,
and the single UI action that caused it. Redact project names from reports.

## Evidence tiers

1. `runtime-observed`: a controlled file-access or call trace links a process
   to one draft operation on a known app version.
2. `static-strong`: symbols and strings explicitly name both the operation and
   draft/key-store type, but runtime execution was not observed.
3. `architecture-only`: executable links or loads a library; this proves the
   component is available, not that it handled the tested project.
4. `unresolved`: filename proximity, generic crypto vocabulary, or behavior
   without an owning process is insufficient.

Examples of claims to reject:

- "`libvecryptor` decrypts `draft_info.json`" based only on generic XOR/FFmpeg
  symbols.
- "the background service saves every project" based only on the library being
  loaded.
- "an opaque backup is corrupted" because `jq` cannot parse it.
- "`draft_meta_info.json` contains the full timeline" because it names the
  project.

## Interoperability implications

For QCut import/export work, prefer documented plaintext schemas from
Jianying-created subdrafts and backups. Preserve unknown JSON fields and keep
version-specific profiles. Treat encrypted current drafts as an unsupported
input until there is a lawful, reproducible, tested interface; do not build a
fragile parser around an observed opaque envelope or a copied key store.

