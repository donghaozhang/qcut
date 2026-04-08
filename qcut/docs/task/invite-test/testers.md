# QCut Beta Tester Invites

## How It Works

QCut uses a **credit-based system** via the license server (`qcut-license-server.zdhpeter.workers.dev`).

- Users sign up with **Google OAuth** (Gmail) or email/password
- Each plan gets monthly credits: Free=50, Pro=500, Team=2000
- AI operations (video gen, image gen, transcription) deduct credits per use
- API keys are **app-level** (FAL, Gemini, etc.) — testers do NOT need their own keys

## Onboarding a Tester

1. Tester signs up in QCut using their Gmail (Google OAuth)
2. They get a **Free plan** automatically (50 credits/month, 5 AI generations, 1 device)
3. To give more credits: either upgrade their plan in the DB or grant top-up credits
4. Payment canary mode (`PAYMENTS_CANARY_ONLY`) can restrict purchases to an allowlist

## Actions Needed

- [ ] Decide: grant extra credits via DB top-up, or upgrade plan to Pro/Team?
- [ ] Decide: add testers to `PAYMENTS_EMAIL_ALLOWLIST` for self-service top-up?
- [ ] Script or admin endpoint to bulk-grant credits by email

## Tester List

| Gmail | Plan | Credits Granted | Date Added | Status |
|-------|------|-----------------|------------|--------|
| | | | | |
