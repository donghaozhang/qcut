# Transcription - Supported Models

This document details the AI models supported for audio transcription in QCut.

## Overview

The Transcription feature supports **Gemini 2.5 Pro** from Google AI for high-quality audio transcription with automatic SRT (SubRip Subtitle) format generation.

---

## Supported Model

### Gemini 2.5 Pro
- **Provider:** Google AI
- **Model ID:** gemini-2.5-pro
- **Quality Rating:** 5/5
- **Speed Rating:** 4/5
- **Description:** Google's advanced multimodal AI model with exceptional audio transcription capabilities and automatic subtitle timing
- **Output Format:** SRT (SubRip Subtitle) with precise timestamps
- **Language Support:** Auto-detect or specify language

---

## Capabilities

### Audio Transcription
Convert spoken audio to text with precise timestamps:
- **Multi-format support:** WAV, MP3, WebM, M4A, AAC, OGG, FLAC
- **Automatic language detection:** Identifies spoken language
- **Manual language specification:** Override with specific language
- **SRT format generation:** Industry-standard subtitle format
- **Precise timestamps:** Millisecond-accurate timing
- **Segmentation:** Automatic sentence/phrase segmentation

---

## Features

### ✅ Supported Features

| Feature | Supported | Description |
|---------|-----------|-------------|
| **Auto Language Detection** | ✅ | Automatically identifies spoken language |
| **Manual Language Override** | ✅ | Specify desired language |
| **SRT Format** | ✅ | Standard subtitle format with timestamps |
| **Timestamp Precision** | ✅ | Millisecond-level accuracy |
| **Smart Segmentation** | ✅ | 1-2 sentence chunks for readability |
| **Multi-format Audio** | ✅ | WAV, MP3, WebM, M4A, AAC, OGG, FLAC |
| **Long Audio Support** | ✅ | Handles extended audio files |
| **Word-level Timestamps** | ❌ | Segment-level only |
| **Speaker Diarization** | ❌ | Not currently supported |

---

## Best Use Cases

### Video Captions
1. **YouTube/Social Media Videos**
   - Generate accurate subtitles
   - Multiple language support
   - Professional formatting

2. **Accessibility Compliance**
   - ADA/WCAG compliant captions
   - Precise timing for sync
   - Clear segmentation

3. **Educational Content**
   - Lecture transcriptions
   - Tutorial subtitles
   - Course materials

### Content Creation
1. **Podcast Transcription**
   - Full episode transcripts
   - Searchable text content
   - Show notes generation

2. **Interview Documentation**
   - Accurate conversation capture
   - Timestamped segments
   - Easy reference

3. **Meeting Notes**
   - Automated meeting transcription
   - Action item extraction
   - Review and reference

---

## Strengths

### Quality
- **High Accuracy** - Gemini 2.5 Pro's advanced language understanding
- **Context Awareness** - Better handling of technical terms, names
- **Punctuation** - Automatic punctuation and capitalization
- **Natural Segmentation** - Logical sentence breaks

### Flexibility
- **Multi-format Support** - 7 audio formats supported
- **Auto-detection** - No need to specify language
- **Override Options** - Manual language selection available
- **SRT Standard** - Universal subtitle format

### Integration
- **Secure Storage** - API keys encrypted via Electron safeStorage
- **Fallback Options** - Environment variable support for development
- **Error Handling** - Comprehensive error messages and recovery
- **Progress Tracking** - Real-time status updates

---

## Limitations

### Feature Constraints
- **No Speaker Separation** - Cannot distinguish multiple speakers
- **No Word Timestamps** - Segment-level timing only
- **SRT Format Only** - Other formats require conversion
- **API Dependency** - Requires Google AI API key

### Processing
- **Cloud-based** - Requires internet connection
- **API Rate Limits** - Subject to Google AI quotas
- **File Size** - Depends on API limits
- **Processing Time** - Varies with audio length

### Language Support
- **Common Languages Best** - Optimal for widely-spoken languages
- **Accent Variations** - May struggle with heavy accents
- **Technical Jargon** - Context helps but may need correction

---

## Audio Format Support

### Supported Formats

| Extension | MIME Type | Notes |
|-----------|-----------|-------|
| **.wav** | audio/wav | Uncompressed, best quality |
| **.mp3** | audio/mp3 | Common compressed format |
| **.webm** | audio/webm | Web-optimized format |
| **.m4a** | audio/mp4 | Apple/iTunes format |
| **.aac** | audio/aac | Advanced Audio Coding |
| **.ogg** | audio/ogg | Ogg Vorbis format |
| **.flac** | audio/flac | Lossless compression |

---

## Parameters

### Transcription Request

```typescript
interface GeminiTranscriptionRequest {
  audioPath: string;      // Path to audio file
  language?: string;      // Optional language code (e.g., "en", "es", "fr")
}
```

### Language Options
- **Auto-detect** - Default, automatically identifies language
- **Specific Language** - Use ISO language codes:
  - `"en"` - English
  - `"es"` - Spanish
  - `"fr"` - French
  - `"de"` - German
  - `"ja"` - Japanese
  - `"zh"` - Chinese
  - And many more...

---

## Output Format

### Transcription Result
```typescript
interface TranscriptionResult {
  text: string;                    // Full transcript text
  segments: TranscriptionSegment[];  // Array of timed segments
  language: string;                  // Detected/specified language
}
```

### Transcription Segment
```typescript
interface TranscriptionSegment {
  id: number;                // Sequential segment ID
  seek: number;              // Seek position (0 for Gemini)
  start: number;             // Start time in seconds
  end: number;               // End time in seconds
  text: string;              // Segment text
  tokens: number[];          // Token array (empty for Gemini)
  temperature: number;       // Temperature value (0.3 default)
  avg_logprob: number;       // Average log probability (0 for Gemini)
  compression_ratio: number; // Compression ratio (0 for Gemini)
  no_speech_prob: number;    // No speech probability (0 for Gemini)
}
```

### SRT Format Example
```
1
00:00:00,000 --> 00:00:03,500
Hello, welcome to the video.

2
00:00:03,500 --> 00:00:07,200
Today we'll learn about captions.

3
00:00:07,200 --> 00:00:11,800
Let's get started with the basics.
```

---

## Usage Examples

### Example 1: Basic Transcription (Auto-detect)
```typescript
const result = await window.electronAPI.transcribe.audio({
  audioPath: "/path/to/audio.mp3"
});

console.log(result.text);      // Full transcript
console.log(result.language);  // Detected language
console.log(result.segments);  // Timed segments
```

### Example 2: Specific Language
```typescript
const result = await window.electronAPI.transcribe.audio({
  audioPath: "/path/to/audio.wav",
  language: "es"  // Spanish
});
```

### Example 3: Using Segments
```typescript
const result = await window.electronAPI.transcribe.audio({
  audioPath: "/path/to/audio.mp3"
});

result.segments.forEach((segment) => {
  console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`);
});
```

### Example 4: Export to SRT File
```typescript
function exportToSRT(segments: TranscriptionSegment[]): string {
  return segments.map((segment, index) => {
    const startTime = formatSRTTime(segment.start);
    const endTime = formatSRTTime(segment.end);

    return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
  }).join('\n');
}

function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}

function pad(num: number, width = 2): string {
  return String(num).padStart(width, '0');
}
```

---

## API Key Configuration

### Secure Storage (Recommended)
API keys are stored encrypted via Electron's safeStorage:

```typescript
// Set API key (encrypted)
await window.electronAPI.apiKeys.set({
  geminiApiKey: 'your_gemini_api_key_here'
});

// Get API key (decrypted automatically)
const keys = await window.electronAPI.apiKeys.get();
console.log(keys.geminiApiKey);
```

**Storage Location:**
- Windows: `%APPDATA%/qcut/api-keys.json`
- macOS: `~/Library/Application Support/qcut/api-keys.json`
- Linux: `~/.config/qcut/api-keys.json`

### Environment Variable (Development)
```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Getting an API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with Google account
3. Create new API key
4. Copy and store securely in QCut settings

---

## Error Handling

### Common Errors and Solutions

#### "GEMINI_API_KEY not found"
- **Cause:** No API key configured
- **Solution:** Set API key in Settings → API Keys
- **Get Key:** https://aistudio.google.com/app/apikey

#### "Transcription failed"
- **Cause:** Invalid audio file or API error
- **Solution:** Verify audio file format and integrity
- **Check:** Ensure file is accessible and not corrupted

#### "Decryption failed"
- **Cause:** Encryption/decryption error
- **Solution:** Falls back to plain text automatically
- **Note:** Check logs for details

#### Audio Format Not Supported
- **Cause:** Unsupported audio format
- **Solution:** Convert to supported format (WAV, MP3, WebM, etc.)
- **Tool:** Use FFmpeg or audio converter

---

## Performance Considerations

### Processing Time Estimates
- **Short audio (< 1 min):** 5-15 seconds
- **Medium audio (1-5 min):** 15-45 seconds
- **Long audio (5-15 min):** 45-120 seconds
- **Extended audio (> 15 min):** 2-5 minutes

*Note: Times vary based on audio length, quality, and API load*

### Optimization Tips
1. **Use compressed formats** (MP3, AAC) for faster upload
2. **Pre-process audio** to remove silence
3. **Split long files** for parallel processing
4. **Cache results** to avoid re-transcription
5. **Batch similar files** together

---

## Quality Optimization

### For Best Accuracy
1. **Clear Audio** - Minimize background noise
2. **Good Microphone** - Use quality recording equipment
3. **Proper Levels** - Avoid clipping and distortion
4. **Specify Language** - When known, don't rely on auto-detect
5. **Single Speaker** - Works best with one speaker at a time

### Audio Preparation
1. **Remove Noise** - Use noise reduction if needed
2. **Normalize Volume** - Consistent audio levels
3. **Trim Silence** - Remove long silent sections
4. **Format Conversion** - Use WAV for highest quality
5. **Bitrate** - Higher bitrate = better quality (96kbps minimum)

---

## Workflow Recommendations

### For Video Captions
1. **Extract audio** from video file
2. **Transcribe** using Gemini 2.5 Pro
3. **Review segments** for accuracy
4. **Edit if needed** using caption editor
5. **Export to SRT** or burn into video
6. **Sync check** ensure timing is correct

### For Podcast Transcription
1. **Upload podcast audio** (MP3 recommended)
2. **Specify language** if known
3. **Generate transcript** via Gemini
4. **Export full text** for show notes
5. **Keep SRT** for searchable timestamps

### For Meeting Documentation
1. **Record meeting** audio
2. **Transcribe** immediately after meeting
3. **Review segments** while fresh
4. **Extract key points** from transcript
5. **Share with team** as needed

---

## Technical Implementation

### Electron Handler
Located at: `qcut/electron/gemini-transcribe-handler.ts`

**Key Features:**
- Secure API key management with encryption
- SRT parsing and segment generation
- Comprehensive error handling and logging
- Audio format auto-detection
- Environment variable fallback

### IPC Interface
```typescript
// Electron IPC handler
ipcMain.handle('transcribe:audio', async (event, request) => {
  // Transcription logic
});
```

### Client Usage
```typescript
// From renderer process
const result = await window.electronAPI.transcribe.audio({
  audioPath: '/path/to/file.mp3',
  language: 'en'
});
```

---

## Comparison: Gemini vs Other Transcription Services

| Feature | Gemini 2.5 Pro | Whisper | Assembly AI | Rev.ai |
|---------|----------------|---------|-------------|--------|
| **Accuracy** | Excellent | Excellent | Very Good | Good |
| **Speed** | Fast | Fast | Medium | Medium |
| **Language Support** | Extensive | Extensive | Good | Limited |
| **Cost** | API-based | Free/Paid | Paid | Paid |
| **SRT Format** | ✅ | ✅ | ✅ | ✅ |
| **Speaker Diarization** | ❌ | Limited | ✅ | ✅ |
| **Word Timestamps** | ❌ | ✅ | ✅ | ✅ |
| **Local Processing** | ❌ | ✅ | ❌ | ❌ |

---

## Best Practices

### General Guidelines
1. **Test with short clips first** - Verify accuracy before long files
2. **Review all transcripts** - AI may make mistakes
3. **Specify language when known** - Better accuracy
4. **Use high-quality audio** - Garbage in, garbage out
5. **Keep API keys secure** - Never commit to version control

### For Production Use
1. **Implement retry logic** - Handle API failures gracefully
2. **Show progress indicators** - User feedback during processing
3. **Validate audio files** - Check format and accessibility
4. **Handle errors gracefully** - User-friendly error messages
5. **Cache results** - Avoid duplicate API calls

### For High-Volume Use
1. **Monitor API quotas** - Track usage limits
2. **Implement rate limiting** - Respect API constraints
3. **Batch processing** - Queue multiple files
4. **Error recovery** - Resume failed transcriptions
5. **Cost tracking** - Monitor API expenses

---

## Future Enhancements

Potential improvements being considered:
- Support for additional transcription models (Whisper, Assembly AI)
- Speaker diarization (identify different speakers)
- Word-level timestamps for karaoke-style captions
- Real-time transcription for live audio
- Automatic punctuation and formatting improvements
- Custom vocabulary for technical terms
- Translation capabilities
- Multiple output formats (VTT, TTML, etc.)
- Batch transcription interface
- Quality confidence scores

---

## Related Documentation

- [Gemini Transcribe Handler](../../../../../electron/gemini-transcribe-handler.ts)
- [Captions UI Component](../../../../../apps/web/src/components/editor/media-panel/views/captions.tsx)
- [Captions Store](../../../../../apps/web/src/stores/captions-store.ts)
- [Caption Types](../../../../../apps/web/src/types/captions.ts)
- [Electron API Types](../../../../../apps/web/src/types/electron.d.ts)

---

## External Resources

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [SRT Format Specification](https://en.wikipedia.org/wiki/SubRip)
- [ISO 639 Language Codes](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)
