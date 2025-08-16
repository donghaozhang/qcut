# Bundle Optimization Plan - High Impact

## 🎯 Priority: Reduce Main Chunk Size (1,050 kB → ~600-700 kB)

**Current Issue**: Main editor chunk `editor._project_id.lazy-1rJWIc-r.js` is **1,050.03 kB** (252.50 kB gzipped)  
**Target**: Reduce to ~600-700 kB through strategic code splitting  
**Expected Impact**: 30-40% reduction in main bundle size, faster initial editor load  

---

## 📋 Subtasks - Manual Chunk Configuration

### Phase 1: Vite Configuration Setup
**Priority**: 🔴 Critical  
**Estimated Time**: 30 minutes  
**Files**: `apps/web/vite.config.ts`

#### Subtask 1.1: Add Manual Chunks Configuration
- [ ] Configure `build.rollupOptions.output.manualChunks`
- [ ] Create chunk strategy for major feature groups
- [ ] Test build output and verify chunk splitting

**Implementation**:
```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        // Separate major features into their own chunks
        'video-processing': ['@ffmpeg/ffmpeg', '@ffmpeg/core', '@ffmpeg/util'],
        'ai-features': [/* AI related modules */],
        'export-engine': [/* Export related modules */],
        'media-processing': [/* Media utilities */],
      }
    }
  }
}
```

#### Subtask 1.2: Analyze Current Bundle Composition
- [ ] Add bundle analyzer to development dependencies
- [ ] Generate bundle analysis report
- [ ] Identify largest modules in main chunk
- [ ] Document findings for targeted splitting

**Tools**:
```bash
bun add -D rollup-plugin-visualizer
# Generate analysis: bun run build:analyze
```

### Phase 2: Feature-Based Code Splitting
**Priority**: 🟡 High  
**Estimated Time**: 45 minutes  
**Impact**: ~200-300 kB reduction

#### Subtask 2.1: AI/Text2Image Features Splitting
- [ ] Move AI generation features to separate chunk
- [ ] Update text2image store to lazy load AI dependencies
- [ ] Create AI feature entry point
- [ ] Test AI functionality after splitting

**Files to Split**:
- `src/lib/fal-ai-client.ts`
- `src/stores/text2image-store.ts`
- AI-related components in `media-panel/views/ai.tsx`

#### Subtask 2.2: Export Engine Splitting
- [ ] Separate export functionality into own chunk
- [ ] Split FFmpeg export engines by type (CLI, optimized, ffmpeg)
- [ ] Update export dialog to lazy load engines
- [ ] Verify export functionality works

**Files to Split**:
- `src/lib/export-engine*.ts`
- `src/components/export-dialog.tsx`
- FFmpeg-related utilities

#### Subtask 2.3: Media Processing Utilities Splitting
- [ ] Extract media processing utilities
- [ ] Separate image manipulation features
- [ ] Split video thumbnail generation
- [ ] Update media store loader patterns

**Files to Split**:
- `src/lib/media-processing.ts`
- `src/lib/image-utils.ts`
- Media utility functions

### Phase 3: Advanced Optimizations
**Priority**: 🟢 Medium  
**Estimated Time**: 60 minutes  
**Impact**: ~100-200 kB reduction

#### Subtask 3.1: Stickers & Overlay Features
- [ ] Split sticker functionality to separate chunk
- [ ] Lazy load sticker canvas components
- [ ] Separate overlay management features
- [ ] Test sticker drag-and-drop functionality

#### Subtask 3.2: Timeline Optimizations
- [ ] Analyze timeline component bundle size
- [ ] Split timeline utilities if beneficial
- [ ] Optimize timeline element rendering
- [ ] Maintain timeline performance

#### Subtask 3.3: Vendor Bundle Optimization
- [ ] Analyze vendor chunk composition
- [ ] Split large vendor libraries if beneficial
- [ ] Optimize React/UI library bundling
- [ ] Review dependency tree for duplicates

### Phase 4: Testing & Validation
**Priority**: 🔴 Critical  
**Estimated Time**: 45 minutes

#### Subtask 4.1: Functionality Testing
- [ ] Test all editor features after chunk splitting
- [ ] Verify lazy loading works correctly
- [ ] Test export functionality across all engines
- [ ] Validate AI features and text2image generation
- [ ] Test stickers and media processing

#### Subtask 4.2: Performance Validation
- [ ] Measure initial load time improvement
- [ ] Test lazy chunk loading performance
- [ ] Verify gzip compression ratios
- [ ] Document before/after bundle sizes

#### Subtask 4.3: Build Integration
- [ ] Ensure build passes with new configuration
- [ ] Update documentation with new chunk strategy
- [ ] Add bundle size monitoring to CI if applicable
- [ ] Create rollback plan if issues arise

---

## 📊 Expected Results

### Before Optimization
```
editor._project_id.lazy-1rJWIc-r.js: 1,050.03 kB (252.50 kB gzipped)
```

### After Optimization Target
```
editor-core.js:           ~400-500 kB  (Core editor functionality)
video-processing.js:      ~200-250 kB  (FFmpeg and video utilities)
ai-features.js:           ~150-200 kB  (Text2image and AI generation)
export-engine.js:         ~100-150 kB  (Export functionality)
media-processing.js:      ~100-150 kB  (Media utilities)
```

**Total Reduction**: 30-40% smaller main chunk  
**Performance Gain**: Faster initial editor load, better caching

---

## 🚀 Implementation Strategy

### Step 1: Quick Assessment (15 minutes)
```bash
cd qcut
bun add -D rollup-plugin-visualizer
# Add analyzer to vite.config.ts
bun run build
# Generate bundle analysis
```

### Step 2: Configure Manual Chunks (30 minutes)
- Update `vite.config.ts` with manual chunk configuration
- Start with obvious separations (FFmpeg, AI, Export)
- Test build and measure impact

### Step 3: Iterative Optimization (60 minutes)
- Apply feature-based splitting incrementally
- Test each change to ensure functionality
- Measure bundle size impact after each change

### Step 4: Validation & Documentation (30 minutes)
- Comprehensive testing of all features
- Document new chunk strategy
- Update build documentation

---

## 🔧 Tools & Commands

### Bundle Analysis
```bash
# Install analyzer
bun add -D rollup-plugin-visualizer

# Analyze current bundle
bun run build
# View analysis in browser
```

### Testing Commands
```bash
# Build and test
bun run build
bun run electron

# Verify chunk loading
# Check Network tab in DevTools for lazy chunks
```

### Monitoring
```bash
# Compare bundle sizes
ls -la qcut/apps/web/dist/assets/*.js

# Gzip size comparison
gzip -c dist/assets/editor*.js | wc -c
```

---

## ⚠️ Risks & Mitigation

### Potential Issues
1. **Lazy Loading Failures**: Chunks fail to load
2. **Circular Dependencies**: Import cycles between chunks
3. **Performance Regression**: Too many small chunks
4. **Feature Breakage**: Functionality stops working

### Mitigation Strategies
1. **Incremental Implementation**: One chunk type at a time
2. **Comprehensive Testing**: Test all features after each change
3. **Rollback Plan**: Keep working configuration backed up
4. **Monitoring**: Track bundle sizes and load times

---

## 📈 Success Metrics

### Primary Metrics
- [ ] Main chunk < 700 kB (30% reduction from 1,050 kB)
- [ ] Initial editor load time improved by 20-30%
- [ ] All features continue to work correctly
- [ ] No performance regressions

### Secondary Metrics
- [ ] Better chunk caching (separate vendor updates)
- [ ] Improved development build times
- [ ] Cleaner bundle organization
- [ ] Future optimization foundation

---

## 🎯 Next Steps After High Impact Work

1. **Store Optimization**: Complete dynamic import lazy loading pattern
2. **Component Splitting**: Split large UI components
3. **Route-based Splitting**: Further optimize router chunks
4. **Dependency Optimization**: Remove unused dependencies

**Status**: Ready for implementation  
**Owner**: To be assigned  
**Timeline**: ~3 hours total for high-impact optimization