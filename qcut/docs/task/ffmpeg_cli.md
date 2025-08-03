为什么优先选择本地 FFmpeg CLI？
性能远超 WASM

FFmpeg.wasm 在浏览器里跑，解/编码都是 JS+WASM，性能受限于单线程和内存拷贝。

本地原生 FFmpeg 直接用 C/C++ 实现，可利用多核和硬件加速（如 NVENC、VAAPI、QuickSync），速度上能快好几倍甚至十倍以上。

稳定成熟

FFmpeg CLI 是业界标准，被广泛优化、测试，兼容各种容器和编解码器。

少了自己管理 Canvas、WASM 导出那些潜在的复杂度，稳定性更高。

集成简单

Electron 主进程天然有 Node.js 能力，只需用 child_process.spawn 或 exec 调用命令行。

导出流程仍然可以保留 UI 进度条和清晰的日志输出。

简单集成示例
js
Copy
Edit
// electron/main.js

import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';

ipcMain.handle('export-video', async (_evt, { inputDir, outputFile, width, height, fps }) => {
  return new Promise((resolve, reject) => {
    // 构造 FFmpeg 参数
    const ffmpegPath = 'ffmpeg'; // 或者打包后写死绝对路径
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(inputDir, 'frame-%04d.png'),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-vf', `scale=${width}:${height}`,
      outputFile
    ];

    const ff = spawn(ffmpegPath, args);

    ff.stdout.on('data', data => {
      console.log(`[FFmpeg] ${data}`);
      // 可以通过 IPC 把进度反馈给渲染进程
    });

    ff.stderr.on('data', data => {
      console.error(`[FFmpeg ERROR] ${data}`);
    });

    ff.on('close', code => {
      if (code === 0) {
        resolve(outputFile);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
});
在渲染进程通过 IPC 调用：

js
Copy
Edit
// apps/web/src/lib/export-engine.ts
import { ipcRenderer } from 'electron';

async function exportWithFFmpeg(…) {
  const output = await ipcRenderer.invoke('export-video', {
    inputDir: this.tempFrameFolder,
    outputFile: this.destinationPath,
    width: this.canvas.width,
    height: this.canvas.height,
    fps: this.fps
  });
  console.log('导出完成：', output);
}
小结
速度：本地 CLI 数倍到十倍于 WASM

稳定：成熟项目，支持硬件加速

实现成本：在 Electron 下只需几行 IPC+spawn 代码

除非你对纯前端导出有特殊需求，否则上手本地 FFmpeg CLI 绝对是 最推荐 的提速方案。