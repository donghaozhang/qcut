const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Simple script to test FFmpeg with the generated frames

const FFMPEG_PATH = 'C:\\Users\\zdhpe\\Desktop\\vite_opencut\\OpenCut-main\\qcut\\electron\\resources\\ffmpeg.exe';
const FRAMES_DIR = 'C:\\Users\\zdhpe\\AppData\\Local\\Temp\\qcut-export\\1754225857238\\frames';
const OUTPUT_FILE = path.join(__dirname, 'test-output.mp4');

console.log('🎬 Simple FFmpeg Frame Test');
console.log('==========================\n');

// Check if frames exist
if (!fs.existsSync(FRAMES_DIR)) {
    console.error('❌ Frames directory not found:', FRAMES_DIR);
    process.exit(1);
}

const frameFiles = fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png'));
console.log(`✅ Found ${frameFiles.length} frames in: ${FRAMES_DIR}`);

// Check if FFmpeg exists
if (!fs.existsSync(FFMPEG_PATH)) {
    console.error('❌ FFmpeg not found:', FFMPEG_PATH);
    process.exit(1);
}
console.log('✅ FFmpeg found:', FFMPEG_PATH);

// Run FFmpeg
console.log('\n🎬 Creating video...');
const args = [
    '-y',
    '-framerate', '30',
    '-i', path.join(FRAMES_DIR, 'frame-%04d.png'),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-t', '5',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUTPUT_FILE
];

console.log('Command:', FFMPEG_PATH, args.join(' '));

const startTime = Date.now();

execFile(FFMPEG_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    const duration = Date.now() - startTime;
    
    if (error) {
        console.error('\n❌ FFmpeg failed!');
        console.error('Error:', error.message);
        console.error('Error code:', error.code);
        if (stderr) console.error('Stderr:', stderr);
        
        console.log('\n💡 If you see error code 3221225781, you\'re likely in Electron.');
        console.log('Run this script directly with Node.js: node test-frames.js');
    } else {
        console.log('\n✅ Video created successfully!');
        console.log(`Time: ${(duration / 1000).toFixed(2)} seconds`);
        
        if (fs.existsSync(OUTPUT_FILE)) {
            const stats = fs.statSync(OUTPUT_FILE);
            console.log(`Output: ${OUTPUT_FILE}`);
            console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log('\n🎉 You can now play the video with any media player!');
        }
    }
});