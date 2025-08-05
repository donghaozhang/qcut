Fixing “dynamically imported but also statically imported” warnings in QCut
When the same module is both statically imported and dynamically imported, Rollup / Vite cannot split it into a separate chunk; everything ends up in the main bundle (≈ 2 MB).

pgsql
Copy
Edit
media-store.ts is dynamically imported but also statically imported
@ffmpeg/ffmpeg/dist/esm/index.js is dynamically imported but also statically imported
ffmpeg-utils.ts is dynamically imported but also statically imported
1 Identify mixed-import modules
File	Size / Usage	Keep as
@ffmpeg/ffmpeg	heavy (≈1 MB), export-only	dynamic
media-store.ts	medium, export UI only	dynamic
Small utilities	tiny, app-wide	static

Search the repo for both patterns:

ts
Copy
Edit
import { … } from './media-store';          // static
const m = await import('./media-store');    // dynamic
Choose one style per module.

2 Unify the import style
Example – convert media-store to pure dynamic:

ts
Copy
Edit
// BEFORE
import { useMediaStore } from './media-store';

// AFTER
const { useMediaStore } = await import('./media-store');
Need the types? Use type-only imports—they don’t count:

ts
Copy
Edit
import type { MediaItem } from './media-store';
3 Lazy-load heavy deps via helpers
ts
Copy
Edit
// src/utils/ffmpeg-loader.ts
let ffmpeg: any;

export async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  const { createFFmpeg } = await import('@ffmpeg/ffmpeg');
  ffmpeg = createFFmpeg({ log: true });
  await ffmpeg.load();
  return ffmpeg;
}
All other code should call await getFFmpeg().

4 Force chunk splitting in Vite
vite.config.ts

ts
Copy
Edit
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@ffmpeg/ffmpeg')) return 'ffmpeg';
          if (/media-store\.ts$/.test(id))  return 'store';
        }
      }
    }
  }
});
5 Clean & rebuild
bash
Copy
Edit
rm -rf node_modules .vite dist
bun install
bun run build
Expected output:

bash
Copy
Edit
dist/assets/ffmpeg.[hash].js   ~1 MB
dist/assets/store.[hash].js    ~15 KB
dist/assets/index.[hash].js    <300 KB
No more mixed-import warnings!

Quick checklist
Dynamic path must be literal (or use /* @vite-ignore */).

Type-only imports are safe.

Check tests/stories for stray static imports.

Keep CLI FFmpeg as a fallback toggle if desired.

