# AI Video Generation Workflow Documentation

## Overview

QCut includes comprehensive AI-powered video generation capabilities, allowing users to create custom videos from text prompts and images directly within the video editor. This system integrates with multiple leading AI video models and seamlessly adds generated content to the timeline.

## Available AI Video Models

### 1. **Kling v2.1**
- **Quality**: ⭐⭐⭐⭐⭐ (Premium with unparalleled motion fluidity)
- **Cost**: $0.15 per generation
- **Resolution**: 1080p
- **Best For**: High-quality cinematic content, complex motion sequences
- **Provider**: Kuaishou Technology

### 2. **Seedance v1 Lite**
- **Quality**: ⭐⭐⭐⭐ (Fast and efficient)
- **Cost**: $0.18 per generation
- **Resolution**: 720p
- **Best For**: Quick prototyping, cost-effective generation
- **Provider**: ByteDance

### 3. **Hailuo 02**
- **Quality**: ⭐⭐⭐⭐ (Standard quality with realistic physics)
- **Cost**: $0.27 per generation
- **Resolution**: 768p
- **Best For**: Balanced quality and cost, realistic physics simulation
- **Provider**: MiniMax

### 4. **Hailuo 02 Pro**
- **Quality**: ⭐⭐⭐⭐⭐ (Premium with ultra-realistic physics)
- **Cost**: $0.48 per generation
- **Resolution**: 1080p
- **Best For**: Professional content, ultra-realistic physics
- **Provider**: MiniMax

### 5. **Seedance v1 Pro**
- **Quality**: ⭐⭐⭐⭐⭐ (High-quality 1080p)
- **Cost**: $0.62 per generation
- **Resolution**: 1080p
- **Best For**: Professional video content, high detail requirements
- **Provider**: ByteDance

### 6. **Veo3 Fast**
- **Quality**: ⭐⭐⭐⭐⭐ (High quality, faster generation)
- **Cost**: $2.00 per generation
- **Resolution**: 1080p
- **Best For**: Premium content with faster turnaround
- **Provider**: Google DeepMind

### 7. **Veo3**
- **Quality**: ⭐⭐⭐⭐⭐ (Highest quality, slower generation)
- **Cost**: $3.00 per generation
- **Resolution**: 1080p
- **Best For**: Top-tier video quality, cinematic productions
- **Provider**: Google DeepMind

## Generation Modes

### Text-to-Video
Generate videos from descriptive text prompts.

**Input Requirements**:
- Text prompt (up to 500 characters)
- At least one selected AI model
- Optional: duration, resolution settings

**Best Practices**:
- Be specific about scenes, actions, and style
- Include camera movements and lighting descriptions
- Describe the desired mood and atmosphere
- Mention specific objects, people, or environments

### Image-to-Video
Animate existing images with AI-generated motion.

**Input Requirements**:
- Image file (JPG, PNG, WEBP, max 10MB)
- At least one selected AI model
- Optional: motion prompt, duration settings

**Best Practices**:
- Use high-quality reference images
- Describe desired motion in the prompt
- Consider the image composition for animation
- Specify camera movements and effects

## AI Video Workflow Steps

### Step 1: Access AI Video Generation
1. Navigate to **Media Panel → AI tab**
2. Choose generation mode:
   - **Text to Video**: Generate from text descriptions
   - **Image to Video**: Animate existing images

### Step 2: Configure Generation Settings

#### For Text-to-Video:
1. **Enter Prompt**: Describe your video in detail (max 500 characters)
2. **Select Models**: Choose one or multiple AI models for comparison
3. **Review Cost**: Total cost displays based on selected models

#### For Image-to-Video:
1. **Upload Image**: Click to select image file (max 10MB)
2. **Add Motion Prompt**: Describe how the image should animate (optional)
3. **Select Models**: Choose AI models for generation
4. **Review Cost**: Total cost calculation

### Step 3: Multi-Model Generation
1. **Generate**: Click "Generate Video" to start the process
2. **Sequential Processing**: Models generate videos one by one to avoid rate limits
3. **Progress Tracking**: Real-time progress updates with:
   - Current model being processed
   - Generation percentage
   - Elapsed time and estimated remaining time
   - Detailed logs (expandable)

### Step 4: Video Processing & Integration
1. **Download Management**: Videos are streamed and cached locally
2. **Media Panel Integration**: Generated videos automatically appear in media library
3. **Timeline Ready**: Videos can be immediately dragged to timeline tracks
4. **Naming Convention**: `AI (ModelName): prompt...`

### Step 5: History & Management
1. **Generation History**: Last 10 generations saved locally
2. **Download Options**: Individual or batch download of generated videos
3. **Regeneration**: Option to generate again with same or modified settings

## Technical Implementation

### Architecture Overview
```
AI Video Generation Flow:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │───▶│  AI Video Client │───▶│   FAL AI APIs   │
│ (Text/Image)    │    │  (Multi-model)   │    │   (7 models)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Media Store   │◀───│  Video Download  │◀───│   Video URLs    │
│   (Timeline)    │    │   & Processing   │    │   (fal.media)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────────┐
│ Storage Service │───▶│   Project DB     │
│  (Persistence)  │    │ (IndexedDB/OPFS) │
└─────────────────┘    └──────────────────┘
```

### Key Components

#### 1. **AI Video Client** (`lib/ai-video-client.ts`)
- Direct integration with FAL AI APIs
- Handles text-to-video and image-to-video generation
- Multi-model support with sequential processing
- Progress tracking and status polling
- Error handling and retry logic

#### 2. **AI Video Output Manager** (`lib/ai-video-output.ts`)
- Manages video download workflow
- Tracks download progress and completion
- Creates File objects from video data
- Handles local file naming and organization

#### 3. **AI View Component** (`components/editor/media-panel/views/ai.tsx`)
- Main UI for AI video generation
- Responsive layout for different panel widths
- Model selection and cost calculation
- Progress visualization and status updates
- Integration with media panel and timeline

#### 4. **AI History Panel** (`components/editor/media-panel/views/ai-history-panel.tsx`)
- Manages generation history (last 10 videos)
- Allows reselection and download of previous generations
- Persistent storage in localStorage

### Model Integration

#### FAL AI Endpoints
```typescript
const MODEL_ENDPOINTS = {
  "kling_v2": "fal-ai/kling-ai/v1.6/text-to-video",
  "seedance": "fal-ai/seedance/text-to-video",
  "hailuo": "fal-ai/hailuo/text-to-video",
  "hailuo_pro": "fal-ai/hailuo-pro/text-to-video",
  "seedance_pro": "fal-ai/seedance-pro/text-to-video",
  "veo3_fast": "fal-ai/veo3-fast/text-to-video",
  "veo3": "fal-ai/veo3/text-to-video"
};
```

#### Generation Parameters
```typescript
interface VideoGenerationRequest {
  prompt: string;
  model: string;
  resolution: string; // "1080p", "720p", "768p"
  duration: number;   // Default: 6 seconds
}

interface ImageToVideoRequest {
  image: File;
  model: string;
  prompt?: string;
  resolution: string;
  duration: number;
}
```

### Video Processing Pipeline

#### Download Workflow
```typescript
// 1. Generate video via FAL API
const response = await generateVideo({
  prompt: "A cat playing with yarn",
  model: "kling_v2",
  resolution: "1080p",
  duration: 6
});

// 2. Stream download video data
const videoData = await downloadVideoToMemory(response.video_url);

// 3. Create File object from downloaded data
const file = await outputManager.createFileFromData(
  videoData,
  `ai-${modelName}-${jobId}.mp4`
);

// 4. Add to media panel
const newMediaItemId = await addMediaItem(projectId, {
  name: `AI (${modelName}): ${prompt}...`,
  type: "video",
  file,
  duration: 6,
  width: 1920,
  height: 1080
});

// The returned ID can be used to reference the media item
console.log(`Added AI video with ID: ${newMediaItemId}`);
```

## Configuration

### Environment Variables
```bash
VITE_FAL_API_KEY=your_fal_api_key_here
```

### Model Defaults
- **Default Duration**: 6 seconds (compatible with all models)
- **Default Resolution**: 1080p for premium models, varies for others
- **Max Prompt Length**: 500 characters
- **Max Image Size**: 10MB
- **History Limit**: 10 most recent generations

### UI Responsive Breakpoints
- **Collapsed**: Width ≤ min width + 2px (icon only)
- **Compact**: Width < 18% (simplified UI)
- **Expanded**: Width > 25% (full feature set)

## Testing & Development

### Mock Generation Mode
For development and testing, the system includes a mock generation mode:
- Uses sample video URLs instead of API calls
- Simulates generation delays and progress updates
- Allows UI testing without consuming API credits
- Toggle via "Generate Preview" button

### Debug Logging
Comprehensive logging throughout the workflow:
```javascript
debugLogger.log("AIView", "VIDEO_GENERATED", {
  modelName,
  videoUrl,
  projectId,
  downloadSize: videoData.length
});
```

## Cost Management

### Real-time Cost Calculation
- Displays total cost for selected models
- Individual model pricing shown in selection UI
- Cost range: $0.15 - $3.00 per video
- Multi-model generation allows cost vs. quality comparison

### Cost Optimization Strategies
1. **Model Selection**: Choose appropriate quality level for use case
2. **Batch Generation**: Generate multiple variations in one session
3. **Preview Mode**: Use mock generation for UI testing
4. **Duration Optimization**: Shorter videos cost less (where applicable)

## Quality Guidelines

### Prompt Engineering Best Practices

#### For Text-to-Video:
- **Scene Description**: "A serene lake at sunset with gentle ripples"
- **Action Details**: "A person walking slowly along a forest path"
- **Camera Work**: "Smooth camera pan following the subject"
- **Style Keywords**: "Cinematic, professional lighting, high detail"
- **Atmosphere**: "Warm golden hour lighting, peaceful mood"

#### For Image-to-Video:
- **Motion Description**: "Gentle swaying of tree branches in the wind"
- **Camera Movement**: "Slow zoom in on the subject"
- **Effect Specification**: "Subtle parallax effect on background elements"
- **Mood Enhancement**: "Add dynamic lighting changes"

### Model Selection Guide

| Use Case | Recommended Models | Reasoning |
|----------|-------------------|-----------|
| **Quick Prototyping** | Seedance v1 Lite, Hailuo 02 | Cost-effective, fast generation |
| **Professional Content** | Kling v2.1, Veo3, Hailuo 02 Pro | High quality, cinematic results |
| **Realistic Physics** | Hailuo 02/Pro, Veo3 | Advanced physics simulation |
| **Fast Turnaround** | Seedance Lite, Veo3 Fast | Optimized for speed |
| **Budget Projects** | Seedance v1 Lite | Lowest cost option |
| **Premium Quality** | Veo3, Kling v2.1 | Highest quality output |

## Troubleshooting

### Common Issues

#### 1. **API Key Not Configured**
- **Symptoms**: "FAL API key not configured" error
- **Solution**: Set `VITE_FAL_API_KEY` in environment variables
- **Verification**: Check console for key length confirmation

#### 2. **Generation Failed**
- **Symptoms**: Error message during generation
- **Causes**: Rate limits, invalid prompts, API issues
- **Solution**: Wait and retry, check prompt content, verify API status

#### 3. **Video Not Appearing in Media Panel**
- **Symptoms**: Generation completes but video missing
- **Causes**: Download failure, storage issues, project selection
- **Solution**: Check console logs, verify active project, retry generation

#### 4. **Slow Generation**
- **Symptoms**: Long wait times, no progress updates
- **Causes**: Model-specific processing times, queue delays
- **Expected**: Veo3 (slowest), Kling v2.1 (moderate), Seedance (fastest)

#### 5. **Image Upload Issues**
- **Symptoms**: Upload fails or image not recognized
- **Solutions**: 
  - Check file size (max 10MB)
  - Verify format (JPG, PNG, WEBP)
  - Try different image

### Debug Information
Enable detailed logging in browser console:
- Generation status and progress
- Model selection and processing
- Download progress and completion
- Media panel integration status
- Error details and stack traces

## Performance Considerations

### Generation Times (Approximate)
- **Seedance v1 Lite**: 30-60 seconds
- **Hailuo 02**: 60-120 seconds  
- **Kling v2.1**: 120-180 seconds
- **Pro Models**: 180-300 seconds
- **Veo3**: 300-600 seconds

### Resource Usage
- **Memory**: ~50-100MB per video during download
- **Storage**: Videos stored as File objects in IndexedDB/OPFS
- **Network**: Streaming download minimizes memory usage
- **UI Responsiveness**: Non-blocking generation with progress updates

### Optimization Features
- **Sequential Generation**: Prevents API rate limiting
- **Progress Streaming**: Real-time status updates
- **Memory Management**: Efficient video data handling
- **Local Caching**: Downloaded videos persist across sessions

## Future Enhancements

### Planned Features
- [ ] **Batch Prompt Processing**: Generate multiple variations from prompt list
- [ ] **Style Transfer**: Apply specific artistic styles to generated videos
- [ ] **Duration Control**: Variable video lengths per model capability
- [ ] **Resolution Options**: Multiple resolution choices per model
- [ ] **Advanced Parameters**: Model-specific fine-tuning controls
- [ ] **Video Upscaling**: Post-generation enhancement options

### API Extensions
- [ ] **Additional Models**: Integration with other AI video providers
- [ ] **Custom Model Training**: User-specific model fine-tuning
- [ ] **Real-time Generation**: Streaming video generation
- [ ] **Collaborative Features**: Shared generation sessions
- [ ] **Template System**: Pre-configured generation templates

## Integration Points

### Timeline Integration
- Generated videos appear immediately in media panel
- Drag-and-drop to timeline tracks
- Standard editing operations (trim, split, effects)
- Thumbnail generation for timeline preview

### Export Compatibility
- MP4 format compatible with all export engines
- Standard video codecs ensure broad compatibility
- Metadata preservation for tracking generation details

### Project Management
- Videos associated with specific projects
- Persistent storage across application sessions
- History tracking per project workspace

---

*Last Updated: January 2025*
*QCut Version: 1.0.0*
*AI Video Models: 7 providers, $0.15-$3.00 per video*