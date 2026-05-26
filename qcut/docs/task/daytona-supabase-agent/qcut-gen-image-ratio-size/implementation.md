# Implementation Notes

## What Changed

### 1. CLI ratio alias

`qcut gen image` now supports `--ratio` as an alias for `--aspect-ratio`.

Covered entry points:

- `electron/native-pipeline/cli/cli.ts`
- `electron/native-pipeline/cli/cli-runner/session.ts`
- `electron/native-pipeline/cli/command-registry.ts`

Parsing priority:

```text
--aspect-ratio > --ratio > --aspect
```

This keeps normal CLI invocation and session mode invocation aligned around the same `aspectRatio` field.

### 2. Native IMA Router GPT Image 2 size mapping

`gpt_image_2_ima` / `gpt_image_2_gmi` now pass native `size` values to the IMA Router GPT Image 2 image endpoint.

Native ratios:

```text
1:1
3:4
9:16
4:3
16:9
```

These ratios enter the final API payload as:

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "16:9"
}
```

Legacy compatibility ratios are still kept:

```text
3:2 -> 1536x1024
2:3 -> 1024x1536
```

### 3. Custom width and height

`qcut gen image` now converts:

```bash
--width 2000 --height 1152
```

into:

```json
{
  "size": "2000x1152"
}
```

Rules:

- `--width` and `--height` must be provided together.
- Both values must be positive integers.
- This is currently allowed only for `gpt_image_2_ima` and the legacy alias `gpt_image_2_gmi`, so unsupported providers do not receive an incorrect `size` field.

### 4. Non-IMA ratio fallback

For image models other than IMA Router GPT Image 2, if the provider returns an image that does not match the requested ratio, the CLI has a centered crop fallback after download.

New files:

- `electron/native-pipeline/output/image-aspect-ratio.ts`
- `electron/native-pipeline/output/__tests__/image-aspect-ratio.test.ts`

This fallback uses `@napi-rs/canvas` to read image dimensions and crop around the center. IMA Router GPT Image 2 does not use this crop path because the service should generate the requested ratio or custom size natively.

### 5. Registry capability metadata

`gpt_image_2_ima` now advertises:

```text
1:1, 3:4, 9:16, 4:3, 16:9, 3:2, 2:3
```

This keeps UI, capability checks, and model listing behavior from incorrectly reporting that these ratios are unsupported.

### 6. Codex terminal second input

`packages/qcut-relay/src/pty-session.ts` already includes the terminal fix: the Daytona / web terminal Codex config writes a TUI keymap.

Key config:

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m", "ctrl-j"]

[tui.keymap.editor]
insert_newline = ["shift-enter"]
```

The intent is to make Enter reliably submit the composer message instead of leaving the terminal in a state where the next message cannot be submitted.

## Why It Failed Before

### `--ratio` was not fully wired

The CLI parser mostly recognized `--aspect-ratio`. When users passed `--ratio 9:16`, some entry points did not map it to `aspectRatio`, so the generation handler never received the requested ratio.

### `--width` / `--height` were parsed but not used for image generation

The global parser could see `width` and `height`, but `handleGenerate` did not convert them into the `size` parameter required by the image model.

### The default `size` blocked user ratios

The `gpt_image_2_ima` registry defaults included `size: "1024x1024"`. If the executor only checked whether `payload.size` existed, it treated the registry default as if it were a user-specified size. That caused `--aspect-ratio 16:9` to still run as 1:1.

The fix distinguishes:

- Registry default size: may be overridden by user `--aspect-ratio`.
- Explicit user size from `--width/--height`: highest priority.

### The old GPT Image mapping was not actually 16:9 / 9:16

The old logic mapped:

```text
16:9 -> 1536x1024
9:16 -> 1024x1536
```

Those are actually 3:2 and 2:3, not the ratios requested by the user. IMA Router GPT Image 2 now receives native size strings for `1:1 / 3:4 / 9:16 / 4:3 / 16:9`.

## Local Regression Tests

Covered behavior:

- CLI parses `--ratio`.
- CLI parses `--width` / `--height`.
- Session mode parses `--ratio`.
- IMA Router GPT Image 2 native ratio payloads.
- IMA Router GPT Image 2 custom size payloads.
- Non-IMA ratio crop fallback.
- Codex PTY keymap bootstrap.

Local commands:

```bash
bunx vitest run \
  electron/native-pipeline/execution/__tests__/step-executors-gpt-image.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-image-size.test.ts \
  electron/native-pipeline/cli/__tests__/cli-parse-kling.test.ts \
  electron/native-pipeline/cli/cli-runner/__tests__/handler-generate-duration.test.ts \
  electron/native-pipeline/output/__tests__/image-aspect-ratio.test.ts \
  electron/native-pipeline/registry-data/__tests__/text-to-image.test.ts

bun x tsc -p electron/tsconfig.json --noEmit

cd packages/qcut-relay
bun run test src/pty-session.test.ts
```

Current result:

```text
6 files / 44 tests passed
electron TypeScript check passed
qcut-relay pty-session: 10 tests passed
```

