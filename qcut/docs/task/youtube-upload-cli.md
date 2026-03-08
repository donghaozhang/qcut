# YouTube Upload CLI Implementation Plan

## Goal

Add a `youtube:upload` command to the native pipeline CLI that uploads a video to YouTube using the YouTube Data API v3 after the user has authenticated via Google OAuth.

## Architecture Overview

```
User logs in (Google OAuth via Better Auth)
  → Auth token stored in Electron (license-handler)
  → CLI command `youtube:upload` reads auth token
  → Exchanges for YouTube-scoped access token
  → Uploads video via YouTube Data API v3 (resumable upload)
```

## Prerequisites

- User must be logged in via Google OAuth (existing flow in `useLogin.ts`)
- Google Cloud project must have **YouTube Data API v3** enabled
- OAuth consent screen must request `youtube.upload` scope
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` already configured in license server

## Implementation Steps

### 1. Add YouTube Upload Scope to Google OAuth

**File:** `packages/license-server/src/auth/better-auth.ts`

Add `https://www.googleapis.com/auth/youtube.upload` to the Google social provider scopes. This ensures the OAuth flow requests permission to upload videos on the user's behalf.

```typescript
socialProviders: {
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
  },
},
```

**Note:** Better Auth stores the Google access token and refresh token in the `accounts` table. We need to retrieve the Google access token (not the session token) for YouTube API calls.

### 2. Add License Server Endpoint to Retrieve Google Access Token

**File:** `packages/license-server/src/routes/youtube.ts` (new)

Create a protected endpoint that returns the user's Google access token for YouTube API calls. The license server already has the token stored via Better Auth's account linking.

```typescript
// GET /api/youtube/token
// Headers: Authorization: Bearer <session-token>
// Returns: { accessToken: string }
```

- Validates session token
- Looks up the user's Google account in the `accounts` table
- Returns the Google `access_token` (refreshing via `refresh_token` if expired)
- Returns 401 if not logged in, 403 if no Google account linked

### 3. Add YouTube Upload Handler

**File:** `electron/native-pipeline/cli/cli-handlers-youtube.ts` (new)

```typescript
interface YouTubeUploadOptions {
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  privacy?: "public" | "unlisted" | "private";
  category?: string;
  thumbnail?: string;
}

export async function handleYouTubeUpload(
  options: YouTubeUploadOptions,
  onProgress: ProgressFn
): Promise<CLIResult>
```

**Flow:**

1. Validate video file exists and is a supported format (mp4, mov, webm, avi)
2. Get auth token from `~/.qcut/.env` or `QCUT_AUTH_TOKEN` env var
3. Call license server `/api/youtube/token` to exchange session token for Google access token
4. Use YouTube Data API v3 resumable upload:
   - `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable`
   - Set video metadata (title, description, tags, privacy, category)
   - Upload file in chunks with progress reporting
5. Optionally upload thumbnail via `POST /youtube/v3/thumbnails/set`
6. Return video URL on success

**Resumable Upload Protocol:**
- Step 1: POST metadata → get upload URI
- Step 2: PUT file chunks (5MB each) to upload URI
- Resume on network failure using `Range` header

### 4. Register CLI Command

**File:** `electron/native-pipeline/cli/command-registry.ts`

Add new command to registry:

```typescript
{
  name: "youtube:upload",
  description: "Upload a video to YouTube",
  category: "YouTube",
  flags: [
    { name: "input", type: "string", short: "i", required: true,
      description: "Path to video file" },
    { name: "title", type: "string", short: "t", required: true,
      description: "Video title" },
    { name: "description", type: "string", short: "d",
      description: "Video description" },
    { name: "tags", type: "string[]",
      description: "Comma-separated tags" },
    { name: "privacy", type: "string", default: "private",
      enum: ["public", "unlisted", "private"],
      description: "Privacy status (default: private)" },
    { name: "category", type: "string", default: "22",
      description: "YouTube category ID (default: 22 = People & Blogs)" },
    { name: "thumbnail", type: "string",
      description: "Path to thumbnail image" },
  ],
  examples: [
    'bun run pipeline youtube:upload -i video.mp4 -t "My Video"',
    'bun run pipeline youtube:upload -i video.mp4 -t "My Video" --privacy unlisted --tags "vlog,travel"',
  ],
}
```

### 5. Wire Command in Runner

**File:** `electron/native-pipeline/cli/cli-runner/runner.ts`

Add case for `youtube:upload` in the command switch:

```typescript
case "youtube:upload":
  return handleYouTubeUpload(parsedFlags, onProgress);
```

### 6. Add Electron IPC for YouTube Upload (GUI integration)

**File:** `electron/youtube-handler.ts` (new)

Expose YouTube upload via Electron IPC so the editor UI can also trigger uploads:

```typescript
// IPC channels:
// "youtube:upload" → starts upload, returns { videoId, url }
// "youtube:upload-progress" → sends progress events to renderer
// "youtube:check-auth" → checks if user has YouTube scope
```

**File:** `electron/preload-types/api-types/youtube-api.ts` (new)

```typescript
export interface YouTubeApi {
  upload(options: YouTubeUploadOptions): Promise<{ videoId: string; url: string }>;
  checkAuth(): Promise<{ authorized: boolean }>;
  onUploadProgress(callback: (progress: number) => void): () => void;
}
```

### 7. Update Key Manager (Optional)

**File:** `electron/native-pipeline/infra/key-manager.ts`

Add `QCUT_AUTH_TOKEN` to the supported keys list so the CLI can authenticate with the license server without the Electron app running.

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/license-server/src/auth/better-auth.ts` | Modify | Add YouTube upload scope |
| `packages/license-server/src/routes/youtube.ts` | New | Token exchange endpoint |
| `electron/native-pipeline/cli/cli-handlers-youtube.ts` | New | YouTube upload handler (~200 lines) |
| `electron/native-pipeline/cli/command-registry.ts` | Modify | Register `youtube:upload` command |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Modify | Wire command to handler |
| `electron/youtube-handler.ts` | New | Electron IPC handler |
| `electron/preload-types/api-types/youtube-api.ts` | New | TypeScript types |
| `electron/native-pipeline/infra/key-manager.ts` | Modify | Add `QCUT_AUTH_TOKEN` key |

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the QCut project (same one used for Google OAuth login)
3. Enable **YouTube Data API v3** under APIs & Services
4. Add `https://www.googleapis.com/auth/youtube.upload` to OAuth consent screen scopes
5. If app is in "Testing" mode, add test users

## YouTube API Quotas

- Default quota: 10,000 units/day
- Video upload: ~1,600 units per upload
- ~6 uploads per day on default quota
- Request quota increase if needed via Google Cloud Console

## Security Considerations

- Default privacy to `private` to prevent accidental public uploads
- Google access tokens are short-lived (1 hour); use refresh token flow
- Never store Google access tokens on disk — always exchange session token at upload time
- Rate limit uploads to prevent quota exhaustion

## Testing

```bash
# Check if user is authenticated
bun run pipeline youtube:upload -i test.mp4 -t "Test" --json

# Upload with all options
bun run pipeline youtube:upload \
  -i output/video.mp4 \
  -t "My QCut Video" \
  -d "Created with QCut" \
  --tags "qcut,video" \
  --privacy unlisted \
  --thumbnail output/thumb.jpg
```

## Future Enhancements

- `youtube:list` — List user's uploaded videos
- `youtube:update` — Update video metadata
- `youtube:delete` — Delete a video
- Batch upload support via `--prompts` pattern
- Integration with `editor:export:start` → auto-upload after export
