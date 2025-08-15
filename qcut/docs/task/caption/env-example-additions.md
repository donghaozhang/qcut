# Environment Variables for Transcription Feature

## New Variables Added to .env.example

### Cloudflare R2 Configuration
```bash
# Cloudflare R2 Storage for transcription
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=opencut-transcription
```

### Modal Transcription Service
```bash
# Modal transcription endpoint
MODAL_TRANSCRIPTION_URL=https://your-modal-endpoint-url.modal.run
```

## Purpose
These environment variables enable:

1. **Cloudflare R2 Storage**: Secure storage for audio/video files during transcription
2. **Modal Integration**: Serverless transcription processing using OpenAI Whisper
3. **Zero-Knowledge Encryption**: Support for encrypted file uploads and processing

## Security Notes
- R2 credentials should be kept secure and not committed to version control
- Modal URL should point to your deployed transcription service
- Consider using environment-specific buckets for development vs production