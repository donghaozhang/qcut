# SharedArrayBuffer Configuration for FFmpeg Performance

## Overview
SharedArrayBuffer is required for optimal FFmpeg WASM performance. It allows the FFmpeg WebAssembly module to use shared memory between web workers, significantly improving video processing speed.

## Changes Made

### 1. **Enabled COEP Headers in Production** ✅
Previously, Cross-Origin-Embedder-Policy (COEP) was only enabled in development mode. Now it's enabled for all environments:

```javascript
// Before (only in dev):
if (isDev) {
  responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];
}

// After (always enabled):
responseHeaders["Cross-Origin-Embedder-Policy"] = ["require-corp"];
```

### 2. **Added CORP Headers to Static Server** ✅
Added Cross-Origin-Resource-Policy headers to the static file server to allow resources to be loaded under COEP:

```javascript
res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
```

### 3. **Required Headers for SharedArrayBuffer**
The following headers are now set:
- `Cross-Origin-Opener-Policy: same-origin` (COOP)
- `Cross-Origin-Embedder-Policy: require-corp` (COEP)
- `Cross-Origin-Resource-Policy: cross-origin` (CORP) for static resources

## Benefits
- ✅ FFmpeg WASM can use SharedArrayBuffer for better performance
- ✅ Faster video processing and thumbnail generation
- ✅ Reduced memory usage through shared memory
- ✅ Better multi-threading support in WebAssembly

## Security Considerations
- COEP requires all resources to explicitly opt-in to being loaded
- External resources must have proper CORS headers
- The CSP policy already allows necessary domains (fal.run, fonts.googleapis.com, etc.)

## Testing
After these changes:
1. FFmpeg should no longer show "SharedArrayBuffer not available" warnings
2. Video processing should be faster
3. Check browser console for any COEP-related errors when loading external resources

## Potential Issues
If external resources fail to load:
1. Check if they have proper CORS headers
2. Add them to the CSP connect-src/img-src directives
3. Consider proxying them through the app's server with proper headers