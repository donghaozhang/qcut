const { spawn, exec, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

// Configuration
const FFMPEG_PATH =
  "C:\\Users\\zdhpe\\Desktop\\vite_opencut\\OpenCut-main\\qcut\\electron\\resources\\ffmpeg.exe";
const FRAMES_DIR =
  "C:\\Users\\zdhpe\\AppData\\Local\\Temp\\qcut-export\\1754225857238\\frames";
const OUTPUT_DIR = path.join(__dirname, "output");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log("🎬 FFmpeg Export Test Script");
console.log("============================");
console.log(`FFmpeg: ${FFMPEG_PATH}`);
console.log(`Frames: ${FRAMES_DIR}`);
console.log(`Output: ${OUTPUT_DIR}`);
console.log("");

// Test 1: Direct spawn (this usually fails in Electron)
function testSpawn() {
  console.log("Test 1: Using spawn()...");
  const outputFile = path.join(OUTPUT_DIR, "test-spawn.mp4");

  const ffmpeg = spawn(FFMPEG_PATH, [
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
  ]);

  ffmpeg.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
  });

  ffmpeg.stderr.on("data", (data) => {
    console.log(`stderr: ${data}`);
  });

  ffmpeg.on("error", (error) => {
    console.error("❌ Spawn error:", error);
    console.log("Error code:", error.code);
    testExecFile();
  });

  ffmpeg.on("close", (code) => {
    if (code === 0) {
      console.log("✅ Spawn successful!");
      console.log(`Output: ${outputFile}`);
    } else {
      console.log(`❌ Spawn failed with code ${code}`);
    }
    console.log("");
    testExecFile();
  });
}

// Test 2: Using execFile
function testExecFile() {
  console.log("Test 2: Using execFile()...");
  const outputFile = path.join(OUTPUT_DIR, "test-execfile.mp4");

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
    { maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        console.error("❌ ExecFile error:", error);
        console.log("Error code:", error.code);
      } else {
        console.log("✅ ExecFile successful!");
        console.log(`Output: ${outputFile}`);
      }
      console.log("");
      testExec();
    }
  );
}

// Test 3: Using exec with full command
function testExec() {
  console.log("Test 3: Using exec()...");
  const outputFile = path.join(OUTPUT_DIR, "test-exec.mp4");
  const command = `"${FFMPEG_PATH}" -y -framerate 30 -i "${path.join(FRAMES_DIR, "frame-%04d.png")}" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p "${outputFile}"`;

  console.log("Command:", command);

  exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error("❌ Exec error:", error);
      console.log("Error code:", error.code);
    } else {
      console.log("✅ Exec successful!");
      console.log(`Output: ${outputFile}`);
    }
    console.log("");
    testWorkaround();
  });
}

// Test 4: Batch file workaround
function testWorkaround() {
  console.log("Test 4: Batch file workaround...");
  const outputFile = path.join(OUTPUT_DIR, "test-batch.mp4");
  const batchFile = path.join(OUTPUT_DIR, "ffmpeg-export.bat");

  const batchContent = `@echo off
cd /d "${path.dirname(FFMPEG_PATH)}"
ffmpeg.exe -y -framerate 30 -i "${path.join(FRAMES_DIR, "frame-%%04d.png")}" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p "${outputFile}"
exit /b %ERRORLEVEL%`;

  fs.writeFileSync(batchFile, batchContent);
  console.log("Created batch file:", batchFile);

  exec(
    `cmd /c "${batchFile}"`,
    { maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Batch error:", error);
        console.log("Error code:", error.code);
      } else {
        console.log("✅ Batch successful!");
        console.log(`Output: ${outputFile}`);
      }
      console.log("");
      testFinalSolution();
    }
  );
}

// Test 5: Final working solution
function testFinalSolution() {
  console.log(
    "Test 5: Final solution - Direct execution with proper environment..."
  );
  const outputFile = path.join(OUTPUT_DIR, "test-final.mp4");

  // Use execFile with full path and proper options
  const options = {
    cwd: path.dirname(FFMPEG_PATH),
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      PATH: `${path.dirname(FFMPEG_PATH)};${process.env.PATH}`,
    },
  };

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
      "-movflags",
      "+faststart",
      outputFile,
    ],
    options,
    (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Final solution error:", error);
        console.log("Error code:", error.code);
        if (stderr) console.log("Stderr:", stderr);
      } else {
        console.log("✅ Final solution successful!");
        console.log(`Output: ${outputFile}`);
        const stats = fs.statSync(outputFile);
        console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      }

      console.log("\n📊 Summary:");
      console.log("===========");
      const files = fs
        .readdirSync(OUTPUT_DIR)
        .filter((f) => f.endsWith(".mp4"));
      files.forEach((file) => {
        const filePath = path.join(OUTPUT_DIR, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`✅ ${file}: ${(stats.size / 1024).toFixed(2)} KB`);
        }
      });
    }
  );
}

// Start tests
console.log("Starting FFmpeg tests...\n");
testSpawn();
