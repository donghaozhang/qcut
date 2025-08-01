# Next.js Audit Results

## Summary of Next.js Dependencies Found

### 1. Next.js Link Component Usage
Found in 12 files:
- apps/web/src/app/(auth)/login/page.tsx
- apps/web/src/app/(auth)/signup/page.tsx
- apps/web/src/app/blog/page.tsx
- apps/web/src/app/contributors/page.tsx
- apps/web/src/app/privacy/page.tsx
- apps/web/src/app/projects/page.tsx
- apps/web/src/app/roadmap/page.tsx
- apps/web/src/app/terms/page.tsx
- apps/web/src/components/editor-header.tsx
- apps/web/src/components/footer.tsx
- apps/web/src/components/header.tsx
- apps/web/src/components/landing/hero.tsx

### 2. Next.js Router Usage (useRouter)
Found in 7 files:
- apps/web/src/app/(auth)/login/page.tsx
- apps/web/src/app/(auth)/signup/page.tsx
- apps/web/src/app/editor/[project_id]/page.tsx
- apps/web/src/app/projects/page.tsx
- apps/web/src/components/editor-header.tsx
- apps/web/src/hooks/auth/useLogin.ts
- apps/web/src/hooks/auth/useSignUp.ts

### 3. Next.js Image Component
Found in 7 files:
- apps/web/src/app/blog/[slug]/page.tsx
- apps/web/src/app/blog/page.tsx
- apps/web/src/app/projects/page.tsx
- apps/web/src/components/background-settings.tsx
- apps/web/src/components/footer.tsx
- apps/web/src/components/header.tsx
- apps/web/src/components/landing/hero.tsx

### 4. Next.js Metadata
- apps/web/src/app/metadata.ts - Exports metadata configuration
- apps/web/src/app/layout.tsx - Root layout with metadata

### 5. API Routes (Need IPC Conversion)
- apps/web/src/app/api/auth/[...all]/route.ts - Authentication endpoints
- apps/web/src/app/api/health/route.ts - Health check endpoint
- apps/web/src/app/api/waitlist/route.ts - Waitlist functionality
- apps/web/src/app/api/waitlist/token/route.ts - Waitlist token management

### 6. App Router Structure
- Uses Next.js 13+ App Router with file-based routing
- Dynamic routes: [project_id], [slug], [...all]
- Route groups: (auth)
- Special files: layout.tsx, page.tsx, route.ts

### 7. Other Next.js Features
- robots.ts - SEO robots configuration
- sitemap.ts - Sitemap generation
- rss.xml/route.ts - RSS feed generation