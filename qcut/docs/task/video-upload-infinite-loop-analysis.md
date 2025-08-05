# Video Upload Infinite Loop Analysis

## Issue Description
When uploading a video file, the process gets stuck at the thumbnail generation step and appears to keep uploading indefinitely.

## Console Log Analysis

From `console_log_v2.md`, the process flow shows:

1. **Upload starts successfully**:
   - File: `2_whitehouse.mp4 (video/mp4, 6.20 MB)`
   - Object URL created: `blob:file:///44264029-155e-43c9-afcd-dee8b6d8a04a`

2. **FFmpeg loads properly**:
   - FFmpeg resources load via app:// protocol
   - Video info extracted successfully: `{duration: 5.04, width: 0, height: 0, fps: 0}`
   - Note: Width, height, and fps are all 0, which is suspicious

3. **Process hangs at**:
   - `[Media Processing] 🖼️ Generating thumbnail with FFmpeg...`
   - No completion or error message after this point

4. **Additional error**:
   - Panel configuration error appears during the process
   - This might be interrupting the normal flow

## Root Cause

The infinite loop is likely caused by:

1. **FFmpeg execution hanging**: The `ffmpeg.exec()` call in `generateThumbnail` might be hanging without throwing an error
2. **No timeout mechanism**: There's no timeout on the FFmpeg operations
3. **Video metadata issues**: The video info shows 0 for width/height/fps, which might cause FFmpeg to fail

## Why It Appears to Keep Uploading

The upload isn't actually repeating - it's stuck waiting for the thumbnail generation to complete. Since there's no error handling or timeout, the UI remains in the "uploading" state indefinitely.

## Immediate Fix

Add error handling and timeout to the thumbnail generation:

```typescript
// In ffmpeg-utils.ts generateThumbnail function
export const generateThumbnail = async (
  videoFile: File,
  timeInSeconds = 1
): Promise<string> => {
  const ffmpeg = await initFFmpeg();
  
  const inputName = "input.mp4";
  const outputName = "thumbnail.jpg";
  
  try {
    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Thumbnail generation timeout')), 10000)
    );
    
    // Write input file
    await ffmpeg.writeFile(
      inputName,
      new Uint8Array(await videoFile.arrayBuffer())
    );
    
    // Generate thumbnail with timeout
    await Promise.race([
      ffmpeg.exec([
        "-i", inputName,
        "-ss", timeInSeconds.toString(),
        "-vframes", "1",
        "-vf", "scale=320:240",
        "-q:v", "2",
        outputName,
      ]),
      timeoutPromise
    ]);
    
    // Read output file
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: "image/jpeg" });
    
    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    
    return URL.createObjectURL(blob);
  } catch (error) {
    // Cleanup on error
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
};
```

## Quick Workaround

In `media-processing.ts`, the code already has a fallback mechanism. The issue is that the FFmpeg call is hanging instead of throwing an error. To fix this immediately:

1. Add a timeout to FFmpeg operations
2. Or skip thumbnail generation temporarily
3. Or use the browser fallback directly for now

## Long-term Solution

1. Investigate why FFmpeg is hanging in the Electron environment
2. Add proper timeout mechanisms to all FFmpeg operations
3. Implement a worker thread for FFmpeg to prevent blocking
4. Add progress indicators for long operations
5. Fix the video metadata extraction (width/height/fps showing as 0)