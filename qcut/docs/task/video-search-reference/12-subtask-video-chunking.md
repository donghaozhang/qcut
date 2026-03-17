# Subtask 2: Video Chunking Pipeline

## Goal

Split a video file into 5-second chunks (temp mp4 files) for individual embedding. Reuse existing FFmpeg infrastructure.

## Files to Create

### `electron/video-search/video-chunker.ts`

```typescript
export interface VideoChunk {
  index: number;
  path: string;       // Temp file path
  startTime: number;  // Seconds from video start
  endTime: number;    // Seconds from video start
  duration: number;   // Actual chunk duration (last chunk may be shorter)
}

export interface ChunkOptions {
  chunkDuration?: number;  // Default: 5 seconds
  outputDir?: string;      // Temp directory for chunks
}

/**
 * Split video into fixed-duration chunks using FFmpeg.
 * Returns array of chunk metadata + temp file paths.
 * Caller is responsible for cleanup via cleanupChunks().
 */
export async function chunkVideo(
  videoPath: string,
  totalDuration: number,
  options?: ChunkOptions
): Promise<VideoChunk[]>;

/**
 * Delete all temp chunk files.
 */
export async function cleanupChunks(chunks: VideoChunk[]): Promise<void>;
```

## FFmpeg Command

```bash
# For each chunk:
ffmpeg -ss {startTime} -i {videoPath} -t {chunkDuration} \
  -c:v libx264 -preset ultrafast -crf 28 \
  -c:a aac -b:a 64k \
  -y {outputDir}/chunk_{index}.mp4
```

- `-preset ultrafast -crf 28`: Fast encoding, lower quality is fine for embeddings
- `-ss` before `-i`: Fast seek (input seeking)
- Audio included: Gemini Embedding 2 can embed audio natively

## Files to Reference

| File | Why |
|------|-----|
| `electron/ffmpeg-handler.ts` | FFmpeg binary path resolution, health check |
| `electron/ffmpeg-basic-handlers.ts` | Existing FFmpeg spawn patterns |
| `electron/ffmpeg-export-handler.ts` | Complex FFmpeg arg building patterns |
| `electron/native-pipeline/infra/file-manager.ts` | Temp file management pattern |

## Implementation Notes

- **Temp directory**: Use `os.tmpdir()` + `qcut-chunks-{mediaId}/` — same pattern as native pipeline
- **Duration detection**: Use `ffprobe` (already available via `ffmpeg-basic-handlers.ts`) or accept duration from media store
- **Last chunk**: May be shorter than 5s. Include actual duration in `VideoChunk.duration`.
- **Parallelism**: Run FFmpeg chunks **sequentially** to avoid CPU contention. Desktop machines have limited cores.
- **Progress**: Emit progress events (chunk N of M) via IPC for UI progress bar.
- **Cleanup**: Always clean up temp chunks, even on error. Use try/finally.

## Edge Cases

- Video shorter than 5s → single chunk
- Audio-only files → still chunk, Gemini embeds audio natively
- Very long videos (>1hr) → many chunks, need progress UI and cancellation support

## Tests

| Test | File |
|------|------|
| 15s video → 3 chunks with correct timestamps | `tests/unit/video-search/video-chunker.test.ts` |
| 3s video → 1 chunk | Same file |
| Cleanup removes all temp files | Same file |
| Chunk metadata has correct startTime/endTime | Same file |
