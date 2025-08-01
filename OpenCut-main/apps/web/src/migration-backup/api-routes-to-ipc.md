# API Routes to IPC Conversion Guide

## API Routes Found

### 1. Health Check
- **Route**: `/api/health`
- **Method**: GET
- **Function**: Simple health check returning "OK"
- **IPC Handler**: `health:check`

### 2. Authentication
- **Route**: `/api/auth/[...all]`
- **Uses**: Better Auth library
- **IPC Handlers Needed**:
  - `auth:login`
  - `auth:signup`
  - `auth:logout`
  - `auth:session`

### 3. Waitlist
- **Route**: `/api/waitlist`
- **Method**: POST
- **Features**:
  - Bot protection with BotId
  - Rate limiting
  - CSRF protection
  - Database operations
- **IPC Handler**: `waitlist:signup`

### 4. Waitlist Token
- **Route**: `/api/waitlist/token`
- **Method**: GET
- **Function**: Generate CSRF token for waitlist
- **IPC Handler**: `waitlist:get-token`

### 5. RSS Feed
- **Route**: `/api/rss.xml`
- **Method**: GET
- **Function**: Generate RSS feed
- **IPC Handler**: Not needed for desktop app

## IPC Implementation Strategy

1. Create IPC handlers in `electron/ipc-handlers/`
2. Move database operations to main process
3. Remove HTTP-specific features (CSRF, cookies)
4. Adapt authentication for desktop context
5. Consider removing waitlist for desktop app