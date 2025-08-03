# FFmpeg File Protocol Loading Issue in Electron

## Problem

When running the packaged Electron app, FFmpeg WASM files fail to load with multiple related errors:

### Error 1: Content Security Policy Violation
```
Refused to connect to 'http://localhost:8080/ffmpeg/ffmpeg-core.js' because it violates the following Content Security Policy directive: "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com".
```

### Error 2: Fetch API Blocked
```
Fetch API cannot load http://localhost:8080/ffmpeg/ffmpeg-core.js. Refused to connect because it violates the document's Content Security Policy.
```

### Error 3: FFmpeg Initialization Failure
```
❌ FFmpeg initialization failed: TypeError: Failed to fetch. Refused to connect because it violates the document's Content Security Policy.
```

The app is trying to fetch FFmpeg files from both:
- HTTP server: `http://localhost:8080/ffmpeg/ffmpeg-core.js`
- File protocol: `file:///C:/path/to/dist/ffmpeg/ffmpeg-core.js`

## Root Cause

**Content Security Policy (CSP) Violation**: The packaged Electron app has a restrictive CSP that only allows connections to:
- `'self'` (same origin)
- `https://fonts.googleapis.com`
- `https://fonts.gstatic.com` 
- `https://api.github.com`

The HTTP server at `localhost:8080` is not in the allowed list, causing the fetch to be blocked.

**File Protocol Limitations**: Electron apps using `file://` protocol have strict security restrictions that prevent loading external resources, including FFmpeg WASM files, even when they're bundled with the app.

**CORS and Security**: The browser's security model treats `file://` URLs differently from `http://` URLs, blocking cross-origin requests and module imports.

## Current Architecture Issue

The current approach in `ffmpeg-utils.ts` tries to:
1. Detect Electron environment
2. Fetch FFmpeg files directly from the file system
3. Convert to blob URLs for loading

However, this fails because:
- `fetch()` cannot access `file://` URLs in Electron's main context
- Security policies block direct file system access from renderer process
- The FFmpeg files are not being properly served by Electron

## Solutions

### Solution 1: Fix Content Security Policy (Immediate)

Update the CSP to allow localhost connections:

```html
<!-- In index.html or via meta tag -->
<meta http-equiv="Content-Security-Policy" content="connect-src 'self' http://localhost:8080 https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com">
```

Or programmatically in Electron main process:
```javascript
// In electron/main.js
webSecurity: false, // Disable web security for development
// OR configure CSP headers
```

### Solution 2: Use Electron's Built-in HTTP Server (Recommended)

Modify the Electron main process to serve static files via HTTP:

```javascript
// In electron/main.ts
import { protocol } from 'electron';

app.whenReady().then(() => {
  // Register a custom protocol to serve files
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.substr(6); // Remove 'app://' prefix
    callback(path.join(__dirname, url));
  });
});
```

### Solution 3: Bundle FFmpeg with Electron Resources

Move FFmpeg files to Electron's resource directory and access via `app.getPath()`:

```javascript
// In electron/preload.ts
import { contextBridge } from 'electron';
import path from 'path';

contextBridge.exposeInMainWorld('electronAPI', {
  getFFmpegPath: () => path.join(process.resourcesPath, 'ffmpeg'),
});
```

### Solution 4: Use Native FFmpeg (Current Working Approach)

The CLI FFmpeg export engine already works because it:
- Uses native FFmpeg executable via Electron IPC
- Bypasses WASM loading entirely
- Processes files through the main process

## Immediate Fix

**Temporarily disable WASM FFmpeg export** and force CLI FFmpeg usage:

```typescript
// In export engine selection logic
const useCliFFmpeg = true; // Force CLI usage in Electron
if (isElectron() || useCliFFmpeg) {
  return new CLIExportEngine();
} else {
  return new FFmpegExportEngine(); // WASM version
}
```

## Long-term Solution

1. **Fix Content Security Policy** to allow necessary resource loading
2. **Implement Electron HTTP server** for serving FFmpeg WASM files
3. **Create proper file protocol handlers** for resource access
4. **Add fallback mechanisms** between WASM and CLI engines
5. **Improve error handling** with clearer user messages

## Files to Modify

- `apps/web/index.html` - Update CSP meta tag
- `apps/web/src/lib/export-engine-factory.ts` - Engine selection logic
- `apps/web/src/lib/ffmpeg-utils.ts` - WASM loading logic
- `electron/main.js` - Add HTTP server, protocol handlers, or webSecurity config
- `electron/preload.ts` - Expose resource path helpers

## Status

- ✅ CLI FFmpeg export works in Electron
- ❌ WASM FFmpeg export fails due to CSP violations and file:// protocol restrictions
- 🔄 Need to fix CSP configuration and implement proper static file serving in Electron

## Additional Context

The error occurs because:
1. The app tries to load FFmpeg WASM from `http://localhost:8080`
2. The current CSP only allows connections to `'self'` and specific HTTPS domains
3. `localhost:8080` is blocked by the CSP
4. The fallback to file:// protocol also fails due to Electron security restrictions

This is a common issue with Electron apps that need to load external resources like WASM files. The solution requires proper integration between Electron's security model, CSP configuration, and the web app's resource loading strategy.