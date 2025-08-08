# QCut Error Documentation and Fixes

## Critical Errors and Solutions

### 1. CORS/COEP Error with FAL Media Images

**Error:**
```
GET https://v3.fal.media/files/zebra/[...].png net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep 200 (OK)
```

**Problem:** Cross-origin image loading blocked by browser's COEP (Cross-Origin Embedder Policy)

**Impact:** AI-generated images from FAL.ai cannot be displayed in the editor

**Solution:**
1. **Short-term fix:** Convert external images to blob URLs after download
2. **Long-term fix:** Configure COEP headers properly or proxy images through local server

**Code location:** `src/lib/fal-ai-client.js` or similar media handling code

---

### 2. FAL Storage Upload 404 Error

**Error:**
```
POST https://fal.run/storage/upload 404 (Not Found)
⚠️ UPLOAD: FAL storage upload failed, falling back to base64: {status: 404, error: `{"detail": "User 'storage' not found"}`}
```

**Problem:** FAL storage endpoint returns 404, indicating either:
- Invalid API endpoint
- Authentication/user account issue
- API deprecation

**Impact:** Images must use base64 fallback (larger payload, slower performance)

**Solution:**
1. Check FAL.ai API documentation for correct storage endpoint
2. Verify API credentials and account status
3. Implement proper error handling for storage failures

**Current Workaround:** App successfully falls back to base64 data URLs

---

### 3. Preview Panel State Issue

**Error:**
```
[Preview] Active media elements found but mediaItems is empty. Preview will show placeholder.
```

**Problem:** Timeline has media elements but preview panel can't access media data

**Impact:** Preview shows placeholder instead of actual media content

**Solution:**
1. Check timeline-store and media-store synchronization
2. Ensure proper media loading before timeline operations
3. Verify media item references are properly maintained

**Code location:** `src/components/editor/preview-panel/` and `src/stores/timeline-store.ts`

---

### 4. Multiple Object URL Creation

**Observation:**
```
[StorageService] Created new object URL for 8_little_yellow.mp4: blob:file:///[different-ids]
```

**Problem:** Same media file creating multiple blob URLs without cleanup

**Impact:** Memory leaks from unreleased blob URLs

**Solution:**
1. Implement proper blob URL cleanup with `URL.revokeObjectURL()`
2. Cache and reuse existing blob URLs for same media
3. Add cleanup on component unmount

**Code location:** `src/lib/storage/` and media store implementations

---

## Error Categories

### Critical (App Breaking)
- CORS/COEP image loading failures
- Storage/database connection issues

### High Priority (Feature Breaking)
- FAL storage upload failures
- Preview panel synchronization issues

### Medium Priority (Performance/UX)
- Memory leaks from blob URLs
- Redundant network requests

### Low Priority (Cosmetic/Logging)
- Verbose console logging
- Non-critical API warnings

---

## General Debugging Guidelines

### 1. Browser Console Analysis
- Enable verbose logging for network issues
- Check Network tab for failed requests
- Monitor Memory tab for blob URL leaks

### 2. Storage Issues
- Test with different storage adapters (IndexedDB vs OPFS)
- Verify storage persistence between sessions
- Check storage quotas and limits

### 3. Media Processing
- Test with different file formats and sizes
- Verify FFmpeg path resolution in packaged app
- Monitor processing memory usage

### 4. AI Integration
- Validate API keys and endpoints
- Test with rate limiting scenarios
- Implement proper fallback mechanisms

---

## Environment-Specific Fixes

### Development vs Production
- **Dev:** More verbose error reporting
- **Prod:** Graceful fallbacks, user-friendly messages

### Electron vs Web
- **Electron:** File system access, native dialogs
- **Web:** Browser security restrictions, limited file access

---

## Quick Fix Commands

### Clear Browser Cache
```bash
# Chrome Developer Tools > Application > Storage > Clear site data
```

### Reset Local Storage
```javascript
// In browser console
localStorage.clear();
indexedDB.databases().then(dbs => 
  dbs.forEach(db => indexedDB.deleteDatabase(db.name))
);
```

### Rebuild with Clean Cache
```bash
cd qcut
rm -rf node_modules dist .turbo
bun install
bun run build
```

---

## Monitoring and Prevention

### Performance Metrics
- Track blob URL creation/cleanup ratio
- Monitor memory usage patterns
- Log API response times

### Error Boundaries
- Implement React error boundaries for AI components
- Add fallback UI for media loading failures
- Graceful degradation for missing features

### Testing Strategies
- Test with large media files
- Simulate network failures
- Test across different browsers and OS versions

---

*Last updated: 2025-08-07*
*Related files: console_error.md, migration logs*