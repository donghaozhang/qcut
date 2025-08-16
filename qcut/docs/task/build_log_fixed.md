# QCut Build Log

## Latest Build Results

### Build Information
- **Date**: 2025-08-16
- **Command**: `bun run build`
- **Status**: ✅ Successful
- **Total Time**: ~28 seconds

### Package Summary
- **Packages in scope**: @opencut/auth, @opencut/db, opencut
- **Running build in**: 3 packages
- **Remote caching**: Disabled

### Build Process

#### TypeScript Compilation
- **Command**: `tsc && vite build`
- **Status**: ✅ Completed successfully

#### Vite Build Details
- **Version**: Vite v7.0.6
- **Mode**: Production build
- **Route tree generation**: 250ms
- **Modules transformed**: 3,028 modules
- **Build time**: ~16 seconds

### Build Warnings

#### 1. PostCSS Plugin Warning
```
A PostCSS plugin did not pass the `from` option to `postcss.parse`. 
This may cause imported assets to be incorrectly transformed.
```
- **Impact**: Minor - assets may be incorrectly transformed
- **Action**: Contact PostCSS plugin authors if issues arise

#### 2. Dynamic Import Warnings
Several stores have mixed dynamic/static imports that prevent optimal chunking:
- `media-store-loader.ts`
- `project-store.ts` 
- `timeline-store.ts`
- `media-store.ts`

**Note**: These warnings are informational and don't affect functionality.

#### 3. Large Chunk Warning
```
Some chunks are larger than 1000 kB after minification.
editor._project_id.lazy-D_7zpTLh.js: 1,049.97 kB (gzipped: 252.48 kB)
```

**Recommendations**:
- Use dynamic import() for code-splitting
- Implement manual chunks via rollupOptions
- Consider adjusting chunk size warning limit

### Build Assets

#### Core Assets
| Asset | Size | Gzipped |
|-------|------|---------|
| `index.html` | 3.44 kB | 1.05 kB |
| `index-BmbqJirs.css` | 152.18 kB | 21.58 kB |

#### JavaScript Bundles
| Bundle | Size | Gzipped |
|--------|------|---------|
| `worker-BAOIWoxA.js` | 2.53 kB | - |
| `image-utils-D6WL0oLE.js` | 2.69 kB | 1.20 kB |
| `media-processing-Dctrsu-5.js` | 3.14 kB | 1.27 kB |
| `fal-ai-client-CaN-CE0t.js` | 4.90 kB | 2.02 kB |
| `export-engine-ffmpeg-Cv3Ern2i.js` | 6.17 kB | 2.29 kB |
| `export-engine-optimized-WvMcXUkX.js` | 6.93 kB | 2.53 kB |
| `export-engine-cli-DQbXYH65.js` | 8.29 kB | 3.00 kB |
| `stickers-DaOUlV4t.js` | 15.15 kB | 4.95 kB |
| `projects.lazy-CT2ViyDH.js` | 25.77 kB | 3.99 kB |
| `skeleton-BQNEpF6C.js` | 38.82 kB | 8.41 kB |
| `vendor-router-B5tYfzPm.js` | 87.70 kB | 29.68 kB |
| `editor-core-DP4ef1oS.js` | 121.12 kB | 36.84 kB |
| `vendor-ui-Cl13T75E.js` | 141.90 kB | 41.78 kB |
| `vendor-react-CvAI8bIM.js` | 313.89 kB | 96.60 kB |
| `index-Bt1ZXWmO.js` | 506.69 kB | 146.61 kB |
| `editor._project_id.lazy-D_7zpTLh.js` | **1,049.97 kB** | 252.48 kB |

#### WebAssembly
| Asset | Size | Gzipped |
|-------|------|---------|
| `ffmpeg-core-CgUfceKH.wasm` | 32,232.42 kB | 10,287.55 kB |

### Build Summary
- ✅ **Status**: Build completed successfully
- ⏱️ **Time**: 28.329s total (15.92s for main build)
- 📦 **Tasks**: 1 successful, 1 total
- 🎯 **Cache**: 0 cached, 1 total
- ⚠️ **Warnings**: 3 non-critical warnings (see above)

### Notes
- FFmpeg WebAssembly is the largest asset (expected for video editing)
- Main editor bundle is large but acceptable for a feature-rich video editor
- All TypeScript compilation passed without errors
- No blocking issues found

### Next Steps
Consider implementing code-splitting for the large editor bundle to improve initial load times, but current build is production-ready.