# Auto-Captions Transcription Setup Guide

## Overview
This guide provides step-by-step instructions for setting up a transcription system using Modal and Python for OpenCut's auto-captions feature.

## Prerequisites
- Complete prerequisites from main README
- Python environment set up
- Modal account access

## Setup Steps

### 1. Environment Setup
```bash
# Create and activate Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Modal Configuration
```bash
# Create Modal account and authenticate
modal setup
```

### 4. Testing
```bash
# Test the transcription script
modal run transcription.py
```

### 5. Deployment
```bash
# Deploy the function
modal deploy transcription.py
```

### 6. Modal Secrets Configuration
Set up required Cloudflare R2 secrets in Modal to keep credentials secure:

```bash
# Create Modal secret with R2 credentials
modal secret set opencut-r2-secrets \
  R2_ACCESS_KEY_ID=your_r2_access_key \
  R2_SECRET_ACCESS_KEY=your_r2_secret_key \
  CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id \
  R2_BUCKET_NAME=opencut-transcription
```

**Security Note**: These secrets are loaded at runtime in `transcription.py` via:
```python
secrets=[modal.Secret.from_name("opencut-r2-secrets")]
```

This approach keeps credentials:
- ✅ Off the client-side
- ✅ Out of the repository  
- ✅ Encrypted in Modal's secret store
- ✅ Only accessible by your deployed functions

### 7. Frontend Environment Variables
Set up the Modal endpoint URL in your frontend environment:

```bash
# In your .env.local file
MODAL_TRANSCRIPTION_URL=https://your-modal-deployment-url.modal.run
```

## Key Features
- **Modal Integration**: Provides infrastructure to run Python code with high RAM requirements
- **Whisper Processing**: Audio transcription using OpenAI's Whisper model
- **Cloudflare R2**: Object storage for audio/video files
- **Scalable Infrastructure**: Serverless computing for transcription workloads

## Development Notes
- VS Code users may need to manually select the Python interpreter
- Ensure all environment variables are properly configured
- Test thoroughly before deploying to production

## Technology Stack
- **Modal**: Serverless computing platform
- **OpenAI Whisper**: Speech-to-text transcription
- **Cloudflare R2**: Object storage
- **Python**: Backend transcription processing