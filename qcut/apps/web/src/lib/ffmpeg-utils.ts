import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let isFFmpegLoaded = false;

// Check if running in Electron
const isElectron = () => {
  return (
    typeof window !== 'undefined' &&
    (window as any).process &&
    (window as any).process.type === 'renderer'
  ) || (
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().indexOf('electron') > -1
  ) || (
    typeof window !== 'undefined' &&
    window.electronAPI
  );
};

// Check if running in packaged Electron app
const isPackagedElectron = () => {
  return isElectron() && typeof window !== 'undefined' && 
         (window.location.protocol === 'file:' && 
          window.location.pathname.includes('/resources/app/'));
};

export const initFFmpeg = async (): Promise<FFmpeg> => {
  console.log('[FFmpeg Utils] 🔧 initFFmpeg called');
  console.log('[FFmpeg Utils] 📊 Current state - ffmpeg exists:', !!ffmpeg, ', isLoaded:', isFFmpegLoaded);
  
  if (ffmpeg && isFFmpegLoaded) {
    console.log('[FFmpeg Utils] ✅ FFmpeg instance already loaded, reusing...');
    return ffmpeg;
  }

  if (ffmpeg && !isFFmpegLoaded) {
    console.log('[FFmpeg Utils] 🔄 FFmpeg instance exists but not loaded, reinitializing...');
  } else {
    console.log('[FFmpeg Utils] 🆕 Creating new FFmpeg instance...');
    ffmpeg = new FFmpeg();
  }

  const baseURL = "/ffmpeg";
  
  // Log environment for debugging
  // Always use blob URLs for both Electron and browser
  // This works around Electron's file:// loading issues
  console.log('FFmpeg initializing...');
  console.log('Is Electron:', isElectron());
  console.log('Location:', window.location.href);
  
  try {
    // For Electron, we need to fetch the files differently
    if (isElectron()) {
      // Try app:// protocol first, fallback to HTTP server
      try {
        const coreUrl = 'app://ffmpeg/ffmpeg-core.js';
        const wasmUrl = 'app://ffmpeg/ffmpeg-core.wasm';
        
        console.log('🌐 Fetching FFmpeg WASM from app:// protocol:', coreUrl, wasmUrl);
        
        // Test if app:// protocol works by trying to fetch one file
        const testResponse = await fetch(coreUrl);
        if (testResponse.ok) {
          // App protocol works, use it for both files
          const wasmResponse = await fetch(wasmUrl);
          
          if (!wasmResponse.ok) {
            throw new Error(`Failed to fetch ffmpeg-core.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`);
          }
          
          const coreBlob = await testResponse.blob();
          const wasmBlob = await wasmResponse.blob();
          
          const coreBlobUrl = URL.createObjectURL(coreBlob);
          const wasmBlobUrl = URL.createObjectURL(wasmBlob);
          
          console.log('🎬 Loading FFmpeg WASM with app:// protocol blob URLs:', coreBlobUrl, wasmBlobUrl);
          console.log('[FFmpeg Utils] ⏳ Calling ffmpeg.load() with blob URLs...');
          console.log('[FFmpeg Utils] 🧪 Testing SharedArrayBuffer availability:', typeof SharedArrayBuffer !== 'undefined');
          console.log('[FFmpeg Utils] 🧪 Testing Worker availability:', typeof Worker !== 'undefined');
          
          // Add timeout to detect hanging
          const loadPromise = ffmpeg.load({
            coreURL: coreBlobUrl,
            wasmURL: wasmBlobUrl,
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('FFmpeg load timeout after 30 seconds')), 30000);
          });
          
          await Promise.race([loadPromise, timeoutPromise]);
          
          console.log('[FFmpeg Utils] ✅ ffmpeg.load() completed successfully');
          console.log('✅ FFmpeg WASM loaded successfully in Electron via app:// protocol');
        } else {
          throw new Error('App protocol not available, falling back to HTTP server');
        }
      } catch (appProtocolError) {
        console.log('🔄 App protocol failed, falling back to HTTP server:', appProtocolError);
        
        // Fallback to HTTP server
        const coreUrl = 'http://localhost:8080/ffmpeg/ffmpeg-core.js';
        const wasmUrl = 'http://localhost:8080/ffmpeg/ffmpeg-core.wasm';
        
        console.log('🌐 Fetching FFmpeg WASM from HTTP server:', coreUrl, wasmUrl);
        
        // Fetch and convert to blob URLs
        const coreResponse = await fetch(coreUrl);
        const wasmResponse = await fetch(wasmUrl);
        
        if (!coreResponse.ok) {
          throw new Error(`Failed to fetch ffmpeg-core.js: ${coreResponse.status} ${coreResponse.statusText}`);
        }
        if (!wasmResponse.ok) {
          throw new Error(`Failed to fetch ffmpeg-core.wasm: ${wasmResponse.status} ${wasmResponse.statusText}`);
        }
        
        const coreBlob = await coreResponse.blob();
        const wasmBlob = await wasmResponse.blob();
        
        const coreBlobUrl = URL.createObjectURL(coreBlob);
        const wasmBlobUrl = URL.createObjectURL(wasmBlob);
        
        console.log('🎬 Loading FFmpeg WASM with HTTP server blob URLs:', coreBlobUrl, wasmBlobUrl);
        
        await ffmpeg.load({
          coreURL: coreBlobUrl,
          wasmURL: wasmBlobUrl,
        });
        
        console.log('✅ FFmpeg WASM loaded successfully in Electron via HTTP server fallback');
      }
    } else {
      // For browser, use the standard approach
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      
      console.log('✅ FFmpeg WASM loaded successfully in browser');
    }
    
    isFFmpegLoaded = true;
    console.log('[FFmpeg Utils] 🎉 FFmpeg is ready for use');
    console.log('[FFmpeg Utils] ✅ initFFmpeg completed successfully');
  } catch (error) {
    console.error('[FFmpeg Utils] ❌ FFmpeg initialization failed:', error);
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
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = "thumbnail.jpg";

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Generate thumbnail at specific time
  await ffmpeg.exec([
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
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "image/jpeg" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return URL.createObjectURL(blob);
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
    await ffmpeg.exec(["-i", inputName, "-f", "null", "-"]);
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
