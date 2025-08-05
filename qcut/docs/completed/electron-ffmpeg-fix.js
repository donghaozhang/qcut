const { execFile, exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// This script demonstrates the FFmpeg execution issue in Electron and provides a working solution

const FFMPEG_PATH =
  "C:\\Users\\zdhpe\\Desktop\\vite_opencut\\OpenCut-main\\qcut\\electron\\resources\\ffmpeg.exe";
const FRAMES_DIR =
  "C:\\Users\\zdhpe\\AppData\\Local\\Temp\\qcut-export\\1754225857238\\frames";
const OUTPUT_DIR = path.join(__dirname, "output");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log("🎬 Electron FFmpeg Fix Demo");
console.log("===========================\n");

// Problem: Direct execution fails in Electron with error 3221225781
function demonstrateProblem() {
  console.log("❌ PROBLEM: Direct FFmpeg execution fails in Electron");
  console.log("Error code 3221225781 = 0xC0000005 (Access Violation)\n");

  const outputFile = path.join(OUTPUT_DIR, "problem-demo.mp4");

  execFile(
    FFMPEG_PATH,
    [
      "-y",
      "-framerate",
      "30",
      "-i",
      path.join(FRAMES_DIR, "frame-%04d.png"),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-t",
      "5",
      "-pix_fmt",
      "yuv420p",
      outputFile,
    ],
    (error, stdout, stderr) => {
      if (error) {
        console.log("Expected error:", error.code);
        console.log("This is what happens in Electron!\n");
      } else {
        console.log(
          "Unexpected success - you might not be in Electron environment\n"
        );
      }
      demonstrateSolution();
    }
  );
}

// Solution 1: Use Windows Script Host
function demonstrateSolution() {
  console.log("✅ SOLUTION 1: Use Windows Script Host (WSH)");
  console.log("This bypasses Electron's process restrictions\n");

  const outputFile = path.join(OUTPUT_DIR, "solution-wsh.mp4");
  const vbsFile = path.join(OUTPUT_DIR, "ffmpeg-export.vbs");

  // Create VBScript that runs FFmpeg
  const vbsContent = `
Set objShell = CreateObject("WScript.Shell")
strCommand = """${FFMPEG_PATH}"" -y -framerate 30 -i ""${path.join(FRAMES_DIR, "frame-%04d.png")}"" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p ""${outputFile}"""
intReturn = objShell.Run(strCommand, 0, True)
WScript.Quit(intReturn)
`;

  fs.writeFileSync(vbsFile, vbsContent);

  // Execute VBScript
  exec(`cscript //NoLogo "${vbsFile}"`, (error, stdout, stderr) => {
    if (error) {
      console.log("VBScript error:", error);
    } else {
      console.log("✅ Success! Video created via VBScript");
      if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        console.log(
          `Output: ${outputFile} (${(stats.size / 1024).toFixed(2)} KB)\n`
        );
      }
    }
    demonstrateNodeWorker();
  });
}

// Solution 2: Use Node.js Worker Thread
function demonstrateNodeWorker() {
  console.log("✅ SOLUTION 2: Use Node.js Worker Thread");
  console.log("This runs FFmpeg in a separate thread\n");

  const workerFile = path.join(OUTPUT_DIR, "ffmpeg-worker.js");

  // Create worker script
  const workerContent = `
const { parentPort } = require('worker_threads');
const { execFile } = require('child_process');

parentPort.on('message', ({ ffmpegPath, args }) => {
    execFile(ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            parentPort.postMessage({ error: error.message });
        } else {
            parentPort.postMessage({ success: true, stdout });
        }
    });
});
`;

  fs.writeFileSync(workerFile, workerContent);

  // Use worker thread
  const { Worker } = require("worker_threads");
  const worker = new Worker(workerFile);

  const outputFile = path.join(OUTPUT_DIR, "solution-worker.mp4");

  worker.postMessage({
    ffmpegPath: FFMPEG_PATH,
    args: [
      "-y",
      "-framerate",
      "30",
      "-i",
      path.join(FRAMES_DIR, "frame-%04d.png"),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-t",
      "5",
      "-pix_fmt",
      "yuv420p",
      outputFile,
    ],
  });

  worker.on("message", (result) => {
    if (result.error) {
      console.log("Worker error:", result.error);
    } else {
      console.log("✅ Success! Video created via Worker Thread");
      if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        console.log(
          `Output: ${outputFile} (${(stats.size / 1024).toFixed(2)} KB)\n`
        );
      }
    }
    worker.terminate();
    demonstratePowerShell();
  });
}

// Solution 3: Use PowerShell with Start-Process
function demonstratePowerShell() {
  console.log("✅ SOLUTION 3: Use PowerShell Start-Process");
  console.log("This creates a new process outside Electron's context\n");

  const outputFile = path.join(OUTPUT_DIR, "solution-powershell.mp4");

  const psCommand = `Start-Process -FilePath "${FFMPEG_PATH}" -ArgumentList @('-y', '-framerate', '30', '-i', '${path.join(FRAMES_DIR, "frame-%04d.png")}', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-t', '5', '-pix_fmt', 'yuv420p', '${outputFile}') -Wait -NoNewWindow -PassThru | ForEach-Object { exit $_.ExitCode }`;

  exec(
    `powershell -Command "${psCommand}"`,
    { maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        console.log("PowerShell error:", error);
      } else {
        console.log("✅ Success! Video created via PowerShell");
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          console.log(
            `Output: ${outputFile} (${(stats.size / 1024).toFixed(2)} KB)\n`
          );
        }
      }
      showFinalSolution();
    }
  );
}

// Final recommended solution for Electron
function showFinalSolution() {
  console.log("🎯 RECOMMENDED SOLUTION FOR ELECTRON");
  console.log("====================================\n");

  const solutionCode = `
// In your Electron main process (ffmpeg-handler.js):

const { app } = require('electron');
const { Worker } = require('worker_threads');

// Create a worker script file
const workerCode = \`
const { parentPort } = require('worker_threads');
const { execFile } = require('child_process');

parentPort.on('message', ({ ffmpegPath, args }) => {
    execFile(ffmpegPath, args, { 
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true 
    }, (error, stdout, stderr) => {
        if (error) {
            parentPort.postMessage({ 
                error: error.message, 
                code: error.code,
                stderr 
            });
        } else {
            parentPort.postMessage({ 
                success: true, 
                stdout 
            });
        }
    });
});
\`;

// Write worker to temp file
const workerPath = path.join(app.getPath('temp'), 'ffmpeg-worker.js');
fs.writeFileSync(workerPath, workerCode);

// Use in your export function
function exportVideo(inputPattern, outputFile) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath);
        
        worker.postMessage({
            ffmpegPath: getFFmpegPath(),
            args: [
                '-y',
                '-framerate', '30',
                '-i', inputPattern,
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                outputFile
            ]
        });
        
        worker.on('message', (result) => {
            worker.terminate();
            if (result.error) {
                reject(new Error(result.error));
            } else {
                resolve({ success: true, outputFile });
            }
        });
        
        worker.on('error', reject);
    });
}
`;

  console.log(solutionCode);

  console.log("\n📋 SUMMARY");
  console.log("==========");
  console.log("1. Worker Threads: Most reliable, works in packaged apps");
  console.log("2. VBScript: Simple but Windows-only");
  console.log(
    "3. PowerShell: Good alternative but may have execution policy issues"
  );
  console.log(
    "\nAll solutions bypass Electron's process spawning restrictions!"
  );
}

// Run the demonstration
console.log("Testing FFmpeg execution methods...\n");
demonstrateProblem();
