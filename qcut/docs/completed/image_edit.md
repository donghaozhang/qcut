# Debug Task List - Image Edit Feature CSP Issues

## Priority 1: Critical CSP (Content Security Policy) Issues

### Issue: FAL Media Image Download Blocked by CSP
**Root Cause**: CSP directive blocks downloads from `fal.media` domain - only allows `fal.run` and `v3.fal.media`
**Estimated Total Time**: 15 minutes

#### Subtask 1.1 (3 min)
- **Action**: Update CSP policy to allow fal.media domain
- **File**: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\index.html`
- **Debug Command**: Check current CSP img-src directive
- **Expected Output**: Should see `img-src 'self' blob: data: app: https://fal.run https://v3.fal.media`

#### Subtask 1.2 (2 min)
- **Action**: Add `https://fal.media` to img-src CSP directive
- **File**: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\index.html`
- **Verification**: Image should load without CSP violation

#### Subtask 1.3 (3 min)
- **Action**: Update connect-src CSP directive to allow fal.media
- **File**: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\index.html`
- **Debug Command**: Check fetch requests succeed to fal.media
- **Expected Output**: No "Refused to connect" errors

#### Subtask 1.4 (2 min)
- **Action**: Test image edit workflow end-to-end
- **File**: Image edit component
- **Verification**: Edited image successfully downloads and displays

#### Subtask 1.5 (3 min)
- **Action**: Add error handling for CSP violations
- **File**: Image utilities or download handler
- **Debug Command**: `console.log('CSP Error detected:', error.message)`
- **Expected Output**: Graceful fallback or user-friendly error message

#### Subtask 1.6 (2 min)
- **Action**: Document allowed domains in code comments
- **File**: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\index.html`
- **Verification**: Clear documentation of why each domain is needed

## Priority 2: FAL Storage Upload Issues

### Issue: FAL Storage Upload Returns 404 - User Not Found
**Root Cause**: Storage endpoint returns "User 'storage' not found" (404 error)
**Estimated Total Time**: 12 minutes

#### Subtask 2.1 (3 min)
- **Action**: Investigate current FAL storage URL configuration
- **File**: FAL API configuration file or component
- **Debug Command**: `console.log('FAL Storage URL:', storageUploadUrl)`
- **Expected Output**: Should show `https://fal.run/storage/upload`

#### Subtask 2.2 (3 min)
- **Action**: Check FAL API authentication and user setup
- **File**: FAL API initialization or auth configuration
- **Debug Command**: `console.log('FAL Auth Status:', authHeaders)`
- **Expected Output**: Valid authentication headers present

#### Subtask 2.3 (3 min)
- **Action**: Implement proper error handling for storage failures
- **File**: Upload handler component
- **Debug Command**: `console.log('Storage fallback triggered:', reason)`
- **Expected Output**: Clean fallback to base64 without console errors

#### Subtask 2.4 (3 min)
- **Action**: Add user-facing notification for upload method
- **File**: UI component handling image uploads
- **Verification**: User sees indication of base64 fallback usage

## Priority 3: Code Quality Improvements

### Issue: Excessive Console Logging in Production
**Root Cause**: Debug logs flooding console in production build
**Estimated Total Time**: 9 minutes

#### Subtask 3.1 (3 min)
- **Action**: Wrap debug logs in development-only conditions
- **File**: Image editing utility functions
- **Debug Command**: `if (process.env.NODE_ENV === 'development') console.log(...)`
- **Expected Output**: Clean console in production builds

#### Subtask 3.2 (3 min)
- **Action**: Create structured logging utility
- **File**: `C:\Users\zdhpe\Desktop\vite_opencut\OpenCut-main\qcut\apps\web\src\lib\logger.ts`
- **Verification**: Consistent log format and levels

#### Subtask 3.3 (3 min)
- **Action**: Replace direct console.log with logger utility
- **File**: Image editing components
- **Debug Command**: `logger.debug('Image processing:', details)`
- **Expected Output**: Structured, filterable log output

## Success Criteria

### Functional Requirements
- [ ] Images from fal.media load without CSP violations
- [ ] Image edit workflow completes successfully
- [ ] Proper error handling for network failures
- [ ] Clean fallback when storage upload fails

### Technical Requirements
- [ ] CSP policy updated with required domains
- [ ] Production console free of debug noise
- [ ] Structured error reporting implemented
- [ ] User-friendly error messages displayed

### Testing Checklist
- [ ] Test in development mode (`bun run electron:dev`)
- [ ] Test in production mode (`bun run electron`)
- [ ] Test with network connectivity issues
- [ ] Test with invalid API credentials
- [ ] Verify EXE build works with changes

## Rollback Instructions

If CSP changes break other functionality:
1. Revert `index.html` CSP changes
2. Test core application functionality
3. Implement more granular CSP rules
4. Document domain requirements

## Investigation Notes

**Current FAL Integration Status:**
- ✅ API calls working (flux-kontext model)
- ✅ Base64 fallback functional
- ❌ Storage upload failing (404 error)
- ❌ Image download blocked by CSP
- ⚠️ Excessive debug logging

**Key Error Patterns:**
- `POST https://fal.run/storage/upload 404 (Not Found)`
- `Refused to connect to 'https://fal.media/...' because it violates CSP`
- `Failed to download image as file: TypeError: Failed to fetch`

**Successful Workflows:**
- Image upload to base64 ✅
- FAL API image generation ✅
- Response parsing ✅