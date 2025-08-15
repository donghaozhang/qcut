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

### 6. Environment Variables
Set up required Cloudflare R2 secrets in Modal for integration.

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