# Large Chunk Size Optimization Guide

## Problem
The build generates a warning about large chunks (>500kB after minification):
```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit
```

Current problematic chunk:
- `index-9d5wdJii.js` - 1,491.91 kB (371.55 kB gzipped)

## Impact
- **Performance**: Large initial bundles increase page load time
- **Caching**: Users must re-download entire bundle for small changes
- **User Experience**: Slower first contentful paint and time to interactive

## Solutions

### 1. Dynamic Imports (Route-Based Code Splitting)

#### Current State
Routes are statically imported, bundling everything together.

#### Recommended Changes
Convert major routes to lazy-loaded components:

```typescript
// Instead of static imports
import EditorPage from './routes/editor.$project_id'
import ProjectsPage from './routes/projects'

// Use dynamic imports
const EditorPage = lazy(() => import('./routes/editor.$project_id'))
const ProjectsPage = lazy(() => import('./routes/projects'))
```

**Expected Impact**: Reduce main bundle by ~300-500kB

### 2. Manual Chunk Configuration

#### Add to `vite.config.ts`:
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libraries
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-tabs', 'lucide-react'],
          'vendor-router': ['@tanstack/react-router'],
          
          // Feature-specific chunks
          'editor-core': [
            './src/stores/editor-store',
            './src/stores/timeline-store',
            './src/stores/playback-store'
          ],
          'media-processing': [
            './src/lib/ffmpeg-utils',
            './src/lib/export-engine',
            '@ffmpeg/ffmpeg'
          ],
          'stickers': [
            './src/components/editor/stickers-overlay',
            './src/stores/stickers-store',
            './src/stores/stickers-overlay-store'
          ]
        }
      }
    }
  }
})
```

**Expected Impact**: Create 5-7 smaller, cacheable chunks

### 3. Library-Specific Optimizations

#### FFmpeg WebAssembly
```typescript
// Lazy load FFmpeg for export functionality only
const loadFFmpeg = () => import('@ffmpeg/ffmpeg')

// Use in export functions
const handleExport = async () => {
  const { FFmpeg } = await loadFFmpeg()
  // Export logic
}
```

#### UI Component Libraries
```typescript
// Tree-shake unused Radix components
import { Dialog } from '@radix-ui/react-dialog' // ✅ Specific import
// Avoid: import * as Dialog from '@radix-ui/react-dialog' // ❌ Imports everything
```

### 4. Bundle Analysis

#### Add bundle analyzer:
```bash
bun add -D rollup-plugin-visualizer
```

#### Update `vite.config.ts`:
```typescript
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'dist/bundle-analysis.html',
      open: true,
      gzipSize: true
    })
  ]
})
```

**Usage**: Run `bun run build` to generate interactive bundle analysis

### 5. Increase Warning Threshold (Temporary)

#### If optimization isn't immediately feasible:
```typescript
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1000 // Increase from 500kB to 1MB
  }
})
```

**Note**: This only suppresses the warning, doesn't fix performance

## Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
1. Add manual chunks configuration
2. Implement route-based lazy loading
3. Tree-shake UI imports

### Phase 2: Deep Optimization (4-6 hours)
1. Analyze bundle composition
2. Lazy-load FFmpeg and heavy dependencies
3. Split editor features into separate chunks

### Phase 3: Advanced (8+ hours)
1. Implement dynamic feature loading
2. Service worker for chunk preloading
3. Progressive enhancement patterns

## Expected Results

### Before Optimization
- Main chunk: ~1,492kB
- Initial load: All features bundled
- Cache efficiency: Poor

### After Optimization
- Main chunk: ~300-500kB
- Vendor chunk: ~200-300kB
- Feature chunks: ~100-200kB each
- Cache efficiency: Excellent
- Load time: 40-60% improvement

## Monitoring

### Bundle Size Tracking
Add to CI/CD pipeline:
```bash
# Generate size report
bun run build
npx bundlesize

# Compare with previous builds
bundlesize --compare-with main
```

### Performance Metrics
Track in development:
- Time to Interactive (TTI)
- First Contentful Paint (FCP)
- Bundle parse/compile time

## Related Files
- `apps/web/vite.config.ts` - Build configuration
- `apps/web/src/main.tsx` - App entry point
- `apps/web/src/routes/` - Route definitions
- Package dependencies in `apps/web/package.json`

## References
- [Vite Bundle Optimization](https://vitejs.dev/guide/build.html#chunking-strategy)
- [React Code Splitting](https://react.dev/reference/react/lazy)
- [Rollup Manual Chunks](https://rollupjs.org/configuration-options/#output-manualchunks)