# Google Login Flow — Payment Website

Last updated: 2026-03-06

## Overview

The payment website uses Google OAuth via Better Auth. The flow is entirely server-side — the static HTML page redirects to the license server, which runs the OAuth dance with Google and bridges the session token back to the browser via a query-param redirect.

## End-to-End Flow

```
User clicks "Continue with Google"
  → startGoogleLogin() [login.html]
    → GET /api/auth/google/start?redirect_url=<dashboard>&error_redirect_url=<login>
      → license server calls Better Auth /api/auth/sign-in/social (Google)
        → 302 redirect to Google OAuth consent screen
          → Google redirects back to /api/auth/callback/google (Better Auth)
            → Better Auth sets session cookie, redirects to /api/auth/oauth/token-bridge
              → token-bridge reads session cookie, extracts token
                → 302 redirect to dashboard.html?auth_token=<token>
                  → PaymentAPI.captureAuthTokenFromUrl() saves token to localStorage
                    → page redirects to dashboard
```

## Key Files

| File | Role |
|------|------|
| `packages/nexusai-website/account/login.html` | UI — Google button, error display, callback processing |
| `packages/nexusai-website/js/payment.js` | `PaymentAPI` — token storage, API base URL resolution, auth helpers |
| `packages/license-server/src/routes/auth.ts` | `/api/auth/google/start`, `/api/auth/oauth/token-bridge`, Better Auth passthrough |
| `packages/auth/src/server.ts` | Better Auth config with Google OAuth provider |
| `packages/license-server/src/middleware/auth.ts` | Validates `Authorization: Bearer <token>` on protected routes |

## Auth Token Lifecycle

- **Stored in**: `localStorage["qcut.authToken"]`
- **Sent as**: `Authorization: Bearer <token>` header on all payment API calls
- **Validated by**: `auth.ts` middleware — checks DB session table first, falls back to JWT verify with `BETTER_AUTH_SECRET`
- **Captured by**: `PaymentAPI.captureAuthTokenFromUrl()` on page load (reads `?auth_token=` param and saves to localStorage)

## Required Configuration

### License Server Environment Variables

```bash
# Google OAuth app credentials (Google Cloud Console)
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Must match the website's origin for redirect validation
PAYMENTS_WEB_BASE_URL=https://quriosity.com.au

# Used to sign/verify JWT fallback tokens
BETTER_AUTH_SECRET=<random-secret-min-32-chars>

# Add website origin if not already in default list
CORS_ALLOWED_ORIGINS=https://quriosity.com.au
```

### Google Cloud Console Setup

1. Create an OAuth 2.0 Client ID (Web application type)
2. Add authorized redirect URI:
   ```
   https://<your-license-server-domain>/api/auth/callback/google
   ```
3. Add authorized JavaScript origins (if needed):
   ```
   https://quriosity.com.au
   ```

### License Server URL (Client Side)

`payment.js` resolves the license server URL in priority order:

| Source | How to set |
|--------|-----------|
| `window.QCUT_LICENSE_SERVER_URL` | Global JS var on the page |
| `?license_server=<url>` | Query param |
| `localStorage["qcut.paymentApiBaseUrl"]` | Persisted from previous session |
| `<meta name="qcut-license-server-url">` | HTML meta tag |
| Default | `https://qcut-license-server.workers.dev` |

Default hardcoded in `payment.js:27`. Override via meta tag if deploying to a different server:

```html
<meta name="qcut-license-server-url" content="https://your-server.example.com">
```

## Error Cases

| Error | Cause | What user sees |
|-------|-------|----------------|
| `auth_error=no_session` | Token bridge ran but Better Auth session cookie was missing | "Login expired before callback. Please try Google sign-in again." |
| `auth_error=access_denied` | User cancelled Google consent | "Google sign-in was cancelled." |
| `auth_error=<other>` | Better Auth OAuth error | "Google sign-in failed: `<error>`" |
| 6-second timeout on redirect | License server unreachable | "Unable to reach Google login endpoint. Check license server URL and deployment." |
| CORS error | Website origin not in `CORS_ALLOWED_ORIGINS` | Network error in browser console |

## Local Development

To test the full login flow locally:

1. Start the license server:
   ```bash
   cd packages/license-server
   bun run dev
   ```

2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` in `packages/license-server/.env`

3. Add `http://localhost:<port>/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console

4. Open `login.html` with a local server (not `file://`) and set the license server URL:
   ```
   login.html?license_server=http://localhost:<port>
   ```

## Security Notes

- The `auth_token` is passed in the URL as a query param (token bridge limitation for static sites). Response headers `Cache-Control: no-store`, `Pragma: no-cache`, and `Referrer-Policy: no-referrer` are set to minimize leakage.
- All redirect targets are validated against an allowlist of origins — open-redirect attacks are blocked in `resolveRedirectUrl()` in `auth.ts`.
- JWT fallback verification requires `BETTER_AUTH_SECRET` — the middleware will return 500 if the secret is missing rather than falling through unauthenticated.
