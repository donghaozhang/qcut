export interface ImageFrame {
  name: string;
  data: Uint8Array;
}

export interface VideoOptions {
  fps: number;
  format: 'mp4' | 'webm';
}

// Re-export initFFmpeg dynamically to avoid mixed imports
export const initFFmpeg = async () => {
  const { initFFmpeg } = await import('./ffmpeg-utils');
  return initFFmpeg();
};

export const encodeImagesToVideo = async (
  frames: ImageFrame[],
  options: VideoOptions
): Promise<Blob> => {
  const { initFFmpeg } = await import('./ffmpeg-utils');
  const ffmpeg = await initFFmpeg();
  
  console.log(`🎬 Encoding ${frames.length} frames to ${options.format} at ${options.fps} fps`);
  
  // Write all frames to FFmpeg file system
  for (const frame of frames) {
    await ffmpeg.writeFile(frame.name, frame.data);
  }
  
  // Prepare FFmpeg command based on format
  const outputFile = `output.${options.format}`;
  const args = [
    '-framerate', options.fps.toString(),
    '-i', 'frame-%05d.png',
    '-c:v', options.format === 'mp4' ? 'libx264' : 'libvpx-vp9',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    outputFile
  ];
  
  if (options.format === 'mp4') {
    args.push('-movflags', '+faststart');
  }
  
  console.log('FFmpeg command:', args.join(' '));
  
  // Execute FFmpeg command
  await ffmpeg.exec(args);
  
  // Read the output file
  const data = await ffmpeg.readFile(outputFile);
  
  // Clean up - remove all files
  for (const frame of frames) {
    try {
      await ffmpeg.deleteFile(frame.name);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  
  try {
    await ffmpeg.deleteFile(outputFile);
  } catch (e) {
    // Ignore cleanup errors
  }
  
  // Convert to Blob
  const blob = new Blob([data], { 
    type: options.format === 'mp4' ? 'video/mp4' : 'video/webm' 
  });
  
  console.log(`✅ Video encoded successfully: ${blob.size} bytes`);
  
  return blob;
};