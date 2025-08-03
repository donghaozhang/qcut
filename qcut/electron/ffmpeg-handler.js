const { ipcMain, app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { TempManager } = require('./temp-manager.js');

const tempManager = new TempManager();

function setupFFmpegIPC() {
  // Create export session
  ipcMain.handle('create-export-session', async () => {
    return tempManager.createExportSession();
  });
  
  // Save frame to disk
  ipcMain.handle('save-frame', async (event, { sessionId, frameName, data }) => {
    const frameDir = tempManager.getFrameDir(sessionId);
    const framePath = path.join(frameDir, frameName);
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(framePath, buffer);
    return framePath;
  });
  
  // Read output file
  ipcMain.handle('read-output-file', async (event, outputPath) => {
    return fs.readFileSync(outputPath);
  });
  
  // Cleanup export session
  ipcMain.handle('cleanup-export-session', async (event, sessionId) => {
    tempManager.cleanup(sessionId);
  });
  
  // Export video with CLI
  ipcMain.handle('export-video-cli', async (event, options) => {
    const { sessionId, width, height, fps, quality } = options;
    
    return new Promise((resolve, reject) => {
      // Get session directories
      const frameDir = tempManager.getFrameDir(sessionId);
      const outputDir = tempManager.getOutputDir(sessionId);
      const outputFile = path.join(outputDir, 'output.mp4');
      
      // Construct FFmpeg arguments
      const ffmpegPath = getFFmpegPath();
      const args = buildFFmpegArgs(frameDir, outputFile, width, height, fps, quality);
      
      console.log('[FFmpeg CLI] Running:', ffmpegPath, args.join(' '));
      const ffprocess = spawn(ffmpegPath, args);
      
      let stderr = '';
      
      ffprocess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[FFmpeg]', output);
        // Send progress updates to renderer
        const progress = parseProgress(output);
        if (progress) {
          event.sender.send('ffmpeg-progress', progress);
        }
      });
      
      ffprocess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('[FFmpeg Error]', data.toString());
      });
      
      ffprocess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputFile });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
      
      ffprocess.on('error', (error) => {
        reject(new Error(`Failed to start FFmpeg: ${error.message}`));
      });
    });
  });
}

function getFFmpegPath() {
  let ffmpegPath;
  
  if (app.isPackaged) {
    // Production: use bundled FFmpeg
    ffmpegPath = path.join(process.resourcesPath, 'ffmpeg.exe');
  } else {
    // Development: try bundled FFmpeg first, then system PATH
    const devPath = path.join(__dirname, 'resources', 'ffmpeg.exe');
    if (fs.existsSync(devPath)) {
      ffmpegPath = devPath;
    } else {
      ffmpegPath = 'ffmpeg'; // System PATH
    }
  }
  
  // Verify FFmpeg exists (skip verification for system PATH)
  if (ffmpegPath !== 'ffmpeg' && !fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg not found at: ${ffmpegPath}`);
  }
  
  return ffmpegPath;
}

function buildFFmpegArgs(inputDir, outputFile, width, height, fps, quality) {
  const qualitySettings = {
    'high': { crf: '18', preset: 'slow' },
    'medium': { crf: '23', preset: 'fast' },
    'low': { crf: '28', preset: 'veryfast' }
  };
  
  const { crf, preset } = qualitySettings[quality] || qualitySettings.medium;
  
  return [
    '-y', // Overwrite output
    '-framerate', String(fps),
    '-i', path.join(inputDir, 'frame-%04d.png'),
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', crf,
    '-vf', `scale=${width}:${height}`,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputFile
  ];
}

function parseProgress(output) {
  // Parse FFmpeg progress from output
  const frameMatch = output.match(/frame=\s*(\d+)/);
  const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
  
  if (frameMatch || timeMatch) {
    return {
      frame: frameMatch ? parseInt(frameMatch[1]) : null,
      time: timeMatch ? timeMatch[1] : null
    };
  }
  return null;
}

module.exports = { setupFFmpegIPC };