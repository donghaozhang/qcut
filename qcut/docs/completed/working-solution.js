const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Working solution that avoids the Windows access violation error

const FFMPEG_PATH =
  "C:\\Users\\zdhpe\\Desktop\\vite_opencut\\OpenCut-main\\qcut\\electron\\resources\\ffmpeg.exe";
const FRAMES_DIR =
  "C:\\Users\\zdhpe\\AppData\\Local\\Temp\\qcut-export\\1754225857238\\frames";
const OUTPUT_FILE = path.join(__dirname, "working-output.mp4");

console.log("🎬 Working FFmpeg Solution");
console.log("=========================\n");

// Method 1: Create a batch file and run it
function createBatchFile() {
  const batchFile = path.join(__dirname, "run-ffmpeg.bat");
  const batchContent = `@echo off
cd /d "${path.dirname(FFMPEG_PATH)}"
ffmpeg.exe -y -framerate 30 -i "${FRAMES_DIR}\\frame-%%04d.png" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart "${OUTPUT_FILE}"
echo Exit code: %ERRORLEVEL%
pause`;

  fs.writeFileSync(batchFile, batchContent);
  console.log("✅ Created batch file:", batchFile);
  console.log("\n📋 Batch file contents:");
  console.log(batchContent);
  console.log("\n🎯 You can now:");
  console.log("1. Double-click the batch file to create the video");
  console.log("2. Or run it from command line: run-ffmpeg.bat");

  return batchFile;
}

// Method 2: Create a PowerShell script
function createPowerShellScript() {
  const psFile = path.join(__dirname, "run-ffmpeg.ps1");
  const psContent = `# FFmpeg Video Export Script
$ffmpegPath = "${FFMPEG_PATH}"
$framesDir = "${FRAMES_DIR}"
$outputFile = "${OUTPUT_FILE.replace(".mp4", "-ps.mp4")}"

Write-Host "Starting FFmpeg export..." -ForegroundColor Green

& $ffmpegPath -y -framerate 30 -i "$framesDir\\frame-%04d.png" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart $outputFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Video created: $outputFile" -ForegroundColor Green
    $fileInfo = Get-Item $outputFile
    Write-Host "File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan
} else {
    Write-Host "FFmpeg failed with exit code: $LASTEXITCODE" -ForegroundColor Red
}

Read-Host "Press Enter to continue"`;

  fs.writeFileSync(psFile, psContent);
  console.log("\n✅ Created PowerShell script:", psFile);
  console.log(
    "\n🎯 To run: powershell -ExecutionPolicy Bypass -File run-ffmpeg.ps1"
  );

  return psFile;
}

// Method 3: Use Windows Script Host (VBS)
function createVBScript() {
  const vbsFile = path.join(__dirname, "run-ffmpeg.vbs");
  const outputVbs = OUTPUT_FILE.replace(".mp4", "-vbs.mp4");
  const vbsContent = `' FFmpeg Video Export Script
Dim objShell, strCommand, intReturn

Set objShell = CreateObject("WScript.Shell")

WScript.Echo "Starting FFmpeg export..."

strCommand = """${FFMPEG_PATH}"" -y -framerate 30 -i ""${FRAMES_DIR}\\frame-%04d.png"" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart ""${outputVbs}"""

intReturn = objShell.Run(strCommand, 1, True)

If intReturn = 0 Then
    WScript.Echo "Success! Video created: " & "${outputVbs}"
Else
    WScript.Echo "FFmpeg failed with exit code: " & intReturn
End If

WScript.Echo "Press OK to continue"`;

  fs.writeFileSync(vbsFile, vbsContent);
  console.log("\n✅ Created VBScript:", vbsFile);
  console.log(
    "\n🎯 To run: Double-click the VBS file or run: cscript run-ffmpeg.vbs"
  );

  return vbsFile;
}

// Method 4: Direct command for manual execution
function showManualCommand() {
  console.log("\n📋 Manual Command (copy and paste in Command Prompt):");
  console.log("=====================================================\n");
  console.log(`cd /d "${path.dirname(FFMPEG_PATH)}"`);
  console.log(
    `ffmpeg.exe -y -framerate 30 -i "${FRAMES_DIR}\\frame-%04d.png" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p -movflags +faststart "${OUTPUT_FILE}"`
  );
  console.log("\n");
}

// Create all solutions
console.log("Creating multiple working solutions...\n");

const batchFile = createBatchFile();
const psFile = createPowerShellScript();
const vbsFile = createVBScript();
showManualCommand();

console.log("🎉 All solutions created!");
console.log("========================\n");
console.log("Files created in:", __dirname);
console.log("- run-ffmpeg.bat     (Double-click to run)");
console.log("- run-ffmpeg.ps1     (PowerShell script)");
console.log("- run-ffmpeg.vbs     (VBScript - Double-click to run)");
console.log("\n📌 The batch file is the simplest solution!");

// Try to run the batch file automatically
console.log("\n🚀 Attempting to run batch file automatically...");
const { exec } = require("child_process");

exec(`start cmd /k "${batchFile}"`, (error) => {
  if (error) {
    console.log("Could not auto-run batch file. Please run it manually.");
  } else {
    console.log("Batch file opened in new window!");
  }
});
