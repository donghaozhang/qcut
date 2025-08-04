# Fix Content Security Policy for Fal.ai API

## Problem
The app's CSP is blocking connections to `https://fal.run/fal-ai/imagen4/preview/ultra` with error:
```
Refused to connect to 'https://fal.run/fal-ai/imagen4/preview/ultra' because it violates the following Content Security Policy directive: "connect-src 'self' app: http://localhost:8080 ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com"
```

## Solution Implemented

### 1. CSP Configuration Located
Found CSP configuration in two files:
- **qcut/electron/main.js** (lines 103-112) - Electron main process CSP
- **qcut/apps/web/index.html** (line 6) - HTML meta tag CSP

### 2. Updated CSP Directives
Added `https://fal.run` to both `connect-src` and `img-src` directives:

#### qcut/electron/main.js (lines 109, 111):
```javascript
"connect-src 'self' app: http://localhost:8080 ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com https://fal.run; " +
"img-src 'self' blob: data: app: https://fal.run;"
```

#### qcut/apps/web/index.html (line 6):
Already had `https://fal.run` in both directives - no changes needed.

### 3. Implementation Details
- The Electron main process uses `session.defaultSession.webRequest.onHeadersReceived` to set CSP headers
- The CSP replaces any existing CSP headers to avoid conflicts
- Both files now have consistent CSP policies

### 4. Next Steps
To complete the fix:
1. Restart the Electron app:
   - Development: `bun run electron:dev`
   - Production: `bun run electron`
2. Test text-to-image generation again
3. Verify no CSP errors appear in the console

### 5. Production Considerations
- ✅ CSP changes apply to both development and production builds
- ✅ The CSP is set dynamically by Electron, so packaged apps will include the fix
- ✅ No separate configuration needed for dev vs production