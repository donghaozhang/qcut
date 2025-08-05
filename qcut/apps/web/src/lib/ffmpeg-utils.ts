import { createFFmpeg } from "@/lib/ffmpeg-loader";
import { toBlobURL } from "@ffmpeg/util";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpeg: FFmpeg | null = null;
let isFFmpegLoaded = false;

// Check if running in Electron
const isElectron = () => {
  return (
    (typeof window !== "undefined" &&
      (window as any).process &&
      (window as any).process.type === "renderer") ||
    (typeof navigator !== "undefined" &&
      navigator.userAgent.toLowerCase().indexOf("electron") > -1) ||
    (typeof window !== "undefined" && window.electronAPI)
  );
};

// Check if running in packaged Electron app
const isPackagedElectron = () => {
  return (
    isElectron() &&
    typeof window !== "undefined" &&
    window.location.protocol === "file:" &&
    window.location.pathname.includes("/resources/app/")
  );
};

// Environment diagnostics for FFmpeg initialization
const checkEnvironment = () => {
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const hasWorker = typeof Worker !== 'undefined';
  
  console.log('[FFmpeg Utils] 🧪 Environment check:', {
    SharedArrayBuffer: hasSharedArrayBuffer,
    Worker: hasWorker,
    isElectron: isElectron(),
    isPackagedElectron: isPackagedElectron(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    location: typeof window !== 'undefined' ? window.location.href : 'N/A'
  });

  if (!hasSharedArrayBuffer) {
    console.warn('[FFmpeg Utils] ⚠️ SharedArrayBuffer not available - performance may be degraded');
    console.warn('[FFmpeg Utils] ⚠️ This may be due to missing COOP/COEP headers or insecure context');
  }

  if (!hasWorker) {
    console.warn('[FFmpeg Utils] ⚠️ Worker API not available - FFmpeg may not function properly');
  }

  return { hasSharedArrayBuffer, hasWorker };
};

// Fallback resource resolution for FFmpeg WebAssembly files
const getFFmpegResourceUrl = async (filename: string): Promise<string> => {
  // Try app:// protocol first
  try {
    const appUrl = `app://ffmpeg/${filename}`;
    const response = await fetch(appUrl);
    if (response.ok) {
      console.log(`[FFmpeg Utils] ✅ App protocol succeeded for ${filename}`);
      return appUrl;
    }
  } catch (error) {
    console.warn(`[FFmpeg Utils] ⚠️ App protocol failed for ${filename}:`, error);
  }

  // Fallback to HTTP server
  try {
    const httpUrl = `http://localhost:8080/ffmpeg/${filename}`;
    const response = await fetch(httpUrl);
    if (response.ok) {
      console.log(`[FFmpeg Utils] ✅ HTTP fallback succeeded for ${filename}`);
      return httpUrl;
    }
  } catch (error) {
    console.warn(`[FFmpeg Utils] ⚠️ HTTP fallback failed for ${filename}:`, error);
  }

  // Final fallback to relative path
  try {
    const relativeUrl = `/ffmpeg/${filename}`;
    const response = await fetch(relativeUrl);
    if (response.ok) {
      console.log(`[FFmpeg Utils] ✅ Relative path fallback succeeded for ${filename}`);
      return relativeUrl;
    }
  } catch (error) {
    console.warn(`[FFmpeg Utils] ⚠️ Relative path fallback failed for ${filename}:`, error);
  }

  throw new Error(`Could not resolve FFmpeg resource: ${filename}`);
};

export const initFFmpeg = async (): Promise<FFmpeg> => {

  if (ffmpeg && isFFmpegLoaded) {
    return ffmpeg;
  }

  if (!ffmpeg || !isFFmpegLoaded) {
    ffmpeg = await createFFmpeg();
  }

  // Validate FFmpeg instance was created successfully
  if (!ffmpeg) {
    throw new Error("Failed to create FFmpeg instance - createFFmpeg() returned null");
  }

  // Validate FFmpeg instance has required methods
  if (typeof ffmpeg.load !== 'function') {
    console.error("[FFmpeg Utils] ❌ FFmpeg instance missing load method:", ffmpeg);
    throw new Error("Invalid FFmpeg instance - missing load() method");
  }



  // Check environment and log diagnostics
  const environment = checkEnvironment();

  try {
    // Use improved resource resolution for both Electron and browser
    let coreUrl, wasmUrl;
    
    try {
      coreUrl = await getFFmpegResourceUrl("ffmpeg-core.js");
      wasmUrl = await getFFmpegResourceUrl("ffmpeg-core.wasm");
      

    } catch (resourceError) {
      console.error("[FFmpeg Utils] ❌ Resource resolution failed:", resourceError);
      throw new Error(`Failed to resolve FFmpeg resources: ${resourceError instanceof Error ? resourceError.message : String(resourceError)}`);
    }

    // Fetch and convert to blob URLs for consistent loading
    let coreResponse, wasmResponse;
    
    try {
      coreResponse = await fetch(coreUrl);
      wasmResponse = await fetch(wasmUrl);
    } catch (fetchError) {
      console.error("[FFmpeg Utils] ❌ Network fetch failed:", fetchError);
      throw new Error(`Network error while fetching FFmpeg resources: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!coreResponse.ok) {
      const errorMsg = `Failed to fetch ffmpeg-core.js: ${coreResponse.status} ${coreResponse.statusText}`;
      console.error("[FFmpeg Utils] ❌", errorMsg);
      throw new Error(errorMsg);
    }
    if (!wasmResponse.ok) {
      const errorMsg = `Failed to fetch ffmpeg-core.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`;
      console.error("[FFmpeg Utils] ❌", errorMsg);  
      throw new Error(errorMsg);
    }

    let coreBlob, wasmBlob;
    
    try {
      coreBlob = await coreResponse.blob();
      wasmBlob = await wasmResponse.blob();
    } catch (blobError) {
      console.error("[FFmpeg Utils] ❌ Blob conversion failed:", blobError);
      throw new Error(`Failed to convert FFmpeg resources to blobs: ${blobError instanceof Error ? blobError.message : String(blobError)}`);
    }

    const coreBlobUrl = URL.createObjectURL(coreBlob);
    const wasmBlobUrl = URL.createObjectURL(wasmBlob);



    // Add timeout to detect hanging with environment-specific timeouts
    const timeoutDuration = environment.hasSharedArrayBuffer ? 30_000 : 60_000; // Longer timeout without SharedArrayBuffer
    
    try {
      const loadPromise = ffmpeg.load({
        coreURL: coreBlobUrl,
        wasmURL: wasmBlobUrl,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`FFmpeg load timeout after ${timeoutDuration/1000} seconds`)),
          timeoutDuration
        );
      });

      await Promise.race([loadPromise, timeoutPromise]);
    } catch (loadError) {
      console.error("[FFmpeg Utils] ❌ FFmpeg load failed:", loadError);
      
      // Cleanup blob URLs on failure
      URL.revokeObjectURL(coreBlobUrl);
      URL.revokeObjectURL(wasmBlobUrl);
      
      // Provide specific error messages based on error type
      const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);
      if (errorMessage.includes('timeout')) {
        throw new Error(`FFmpeg initialization timed out. This may be due to slow network or missing SharedArrayBuffer support.`);
      } else if (errorMessage.includes('SharedArrayBuffer')) {
        throw new Error(`FFmpeg requires SharedArrayBuffer support. Please ensure proper COOP/COEP headers are set.`);
      } else {
        throw new Error(`FFmpeg initialization failed: ${errorMessage}`);
      }
    }

    isFFmpegLoaded = true;
  } catch (error) {
    console.error("[FFmpeg Utils] ❌ FFmpeg initialization failed:", error);
    isFFmpegLoaded = false;
    ffmpeg = null;
    throw error;
  }

  return ffmpeg;
};

export const isFFmpegReady = (): boolean => {
  return ffmpeg !== null && isFFmpegLoaded;
};

export const getFFmpegInstance = (): FFmpeg | null => {
  return ffmpeg;
};

export const generateThumbnail = async (
  videoFile: File,
  timeInSeconds = 1
): Promise<string> => {
  console.log('[FFmpeg] generateThumbnail called');
  const ffmpeg = await initFFmpeg();
  console.log('[FFmpeg] FFmpeg initialized for thumbnail generation');

  const inputName = "input.mp4";
  const outputName = "thumbnail.jpg";

  try {
    // Add timeout wrapper (10 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('[FFmpeg] Thumbnail generation timeout after 10s')), 10000)
    );

    // Write input file
    await ffmpeg.writeFile(
      inputName,
      new Uint8Array(await videoFile.arrayBuffer())
    );

    console.log('[FFmpeg] Starting thumbnail generation...');
    
    // Generate thumbnail with timeout
    await Promise.race([
      ffmpeg.exec([
        "-i",
        inputName,
        "-ss",
        timeInSeconds.toString(),
        "-vframes",
        "1",
        "-vf",
        "scale=320:240",
        "-q:v",
        "2",
        outputName,
      ]),
      timeoutPromise
    ]);

    console.log('[FFmpeg] Thumbnail generation completed');

    // Read output file
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: "image/jpeg" });

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('[FFmpeg] Thumbnail generation failed:', error);
    
    // Cleanup on error
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
};

export const trimVideo = async (
  videoFile: File,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.mp4";

  // Set up progress callback
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  const duration = endTime - startTime;

  // Trim video
  await ffmpeg.exec([
    "-i",
    inputName,
    "-ss",
    startTime.toString(),
    "-t",
    duration.toString(),
    "-c",
    "copy", // Use stream copy for faster processing
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "video/mp4" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
};

export const getVideoInfo = async (
  videoFile: File
): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
}> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Capture FFmpeg stderr output with a one-time listener pattern
  let ffmpegOutput = "";
  let listening = true;
  const listener = (data: string) => {
    if (listening) ffmpegOutput += data;
  };
  ffmpeg.on("log", ({ message }) => listener(message));

  // Run ffmpeg to get info (stderr will contain the info)
  try {
    // Add timeout wrapper (5 seconds for info extraction)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('[FFmpeg] Video info extraction timeout after 5s')), 5000)
    );
    
    await Promise.race([
      ffmpeg.exec(["-i", inputName, "-f", "null", "-"]),
      timeoutPromise
    ]);
  } catch (error) {
    listening = false;
    await ffmpeg.deleteFile(inputName);
    console.error("FFmpeg execution failed:", error);
    throw new Error(
      "Failed to extract video info. The file may be corrupted or in an unsupported format."
    );
  }

  // Disable listener after exec completes
  listening = false;

  // Cleanup
  await ffmpeg.deleteFile(inputName);

  // Parse output for duration, resolution, and fps
  // Example: Duration: 00:00:10.00, start: 0.000000, bitrate: 1234 kb/s
  // Example: Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps, 30 tbr, 90k tbn, 60 tbc

  const durationMatch = ffmpegOutput.match(/Duration: (\d+):(\d+):([\d.]+)/);
  let duration = 0;
  if (durationMatch) {
    const [, h, m, s] = durationMatch;
    duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }

  const videoStreamMatch = ffmpegOutput.match(
    /Video:.* (\d+)x(\d+)[^,]*, ([\d.]+) fps/
  );
  let width = 0,
    height = 0,
    fps = 0;
  if (videoStreamMatch) {
    width = parseInt(videoStreamMatch[1]);
    height = parseInt(videoStreamMatch[2]);
    fps = parseFloat(videoStreamMatch[3]);
  }

  return {
    duration,
    width,
    height,
    fps,
  };
};

export const convertToWebM = async (
  videoFile: File,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.webm";

  // Set up progress callback
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Convert to WebM
  await ffmpeg.exec([
    "-i",
    inputName,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "30",
    "-b:v",
    "0",
    "-c:a",
    "libopus",
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "video/webm" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
};

export const extractAudio = async (
  videoFile: File,
  format: "mp3" | "wav" = "mp3"
): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = `output.${format}`;

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Extract audio
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn", // Disable video
    "-acodec",
    format === "mp3" ? "libmp3lame" : "pcm_s16le",
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: `audio/${format}` });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
};
