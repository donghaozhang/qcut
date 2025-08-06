# Task: Add WAN v2.2 Turbo Text-to-Video Model

## Overview
Add support for the WAN v2.2 Turbo text-to-video model from fal.ai to the existing AI video generation system without breaking current functionality.

**Model URL**: https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video/turbo/api  
**Endpoint**: `https://fal.run/fal-ai/wan/v2.2-a14b/text-to-video/turbo`

## Model Specifications
- **Provider**: fal.ai
- **Quality**: High-resolution video generation
- **Speed**: Turbo mode (faster than standard WAN v2.2)
- **Resolution**: Up to 1080p
- **Duration**: Variable (needs API documentation review)
- **Estimated Cost**: ~$0.20-0.40 per generation (estimate)

## Files to Modify

### 1. AI View Component
**File**: `apps/web/src/components/editor/media-panel/views/ai.tsx`
- **Lines to modify**: 56-106 (AI_MODELS array)
- **Changes needed**:
  - Add new model entry to `AI_MODELS` array
  - Include model specifications (id, name, description, price, resolution)
  - Update model count references in UI

### 2. AI Video Client
**File**: `apps/web/src/lib/ai-video-client.ts`
- **Lines to modify**: 101-109 (modelEndpoints object)
- **Changes needed**:
  - Add WAN Turbo endpoint to `modelEndpoints` object
  - Handle any WAN Turbo-specific parameters (likely similar to existing models)
  - Ensure response format compatibility (should follow existing pattern)

### 3. Model Endpoints Configuration
**File**: `apps/web/src/lib/ai-video-client.ts`
- **Section**: `modelEndpoints` object (lines 101-109)
- **Changes needed**:
```typescript
const modelEndpoints: { [key: string]: string } = {
  "seedance": "fal-ai/bytedance/seedance/v1/lite/text-to-video",
  "seedance_pro": "fal-ai/bytedance/seedance/v1/pro/text-to-video",
  "veo3": "fal-ai/google/veo3",
  "veo3_fast": "fal-ai/google/veo3/fast",
  "hailuo": "fal-ai/minimax/hailuo-02/standard/text-to-video",
  "hailuo_pro": "fal-ai/minimax/hailuo-02/pro/text-to-video",
  "kling_v2": "fal-ai/kling-video/v2.1/master",
  "wan_turbo": "fal-ai/wan/v2.2-a14b/text-to-video/turbo", // New endpoint
};
```

## Implementation Steps

### Step 1: Research Model Parameters
- [ ] Review API documentation at https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video/turbo/api
- [ ] Identify required/optional parameters
- [ ] Determine response format (likely similar to existing WAN v2.2)
- [ ] Confirm pricing and duration limits

### Step 2: Update Model Configuration
**File**: `apps/web/src/components/editor/media-panel/views/ai.tsx`

Add to `AI_MODELS` array (around line 56):
```typescript
{
  id: "wan_turbo",
  name: "WAN v2.2 Turbo",
  description: "High-speed photorealistic video generation",
  price: "0.30", // Update with actual pricing
  resolution: "1080p",
}
```

### Step 3: Update Video Generation Client
**File**: `apps/web/src/lib/ai-video-client.ts`

#### A. Add Model Endpoint Mapping (around line 101-109):
```typescript
// Simply add to the modelEndpoints object
const modelEndpoints: { [key: string]: string } = {
  // ... existing models
  "wan_turbo": "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
};
```
**Note**: No switch/case needed - the existing lookup uses `modelEndpoints[request.model]`

#### B. Handle Parameters (likely no changes needed):
```typescript
// WAN Turbo will likely use standard parameters like other models
// Check lines 124-147 for existing parameter handling patterns
// Most likely no special handling needed - will use default:
payload.duration = request.duration || 5;
payload.resolution = request.resolution || "1080p";
```

#### C. Handle Response Format (likely no changes needed):
```typescript
// WAN Turbo should follow the standard FAL.ai response format
// Check lines 219-252 for existing response handling
// Should work with existing logic: queueResult.video?.url
```

### Step 4: Update UI Integration
**File**: `apps/web/src/components/editor/media-panel/views/ai.tsx`

#### A. Model Selection UI (lines 978-1043):
- No changes needed - automatically includes new model in selection list

#### B. Cost Calculation (lines 719-723):
- No changes needed - automatically calculates total cost

#### C. Progress Tracking (lines 541-583):
- No changes needed - uses existing model name lookup

### Step 5: Documentation Updates
**Files to update**:
- `apps/web/src/lib/text2image-models.ts` - NOT applicable (this is for images)
- `docs/task/ai-video-workflow.md` - Add WAN Turbo to model list

#### Update AI Video Workflow Documentation:
Add new model entry:
```markdown
### 8. **WAN v2.2 Turbo** (fal.ai)
- **Quality**: ⭐⭐⭐⭐⭐ (High-resolution with speed optimization)
- **Speed**: ⭐⭐⭐⭐⭐ (Turbo mode)
- **Cost**: ~$0.30 per generation
- **Resolution**: 1080p
- **Best For**: High-quality results with faster generation
- **Provider**: fal.ai
```

## Testing Checklist

### Unit Testing
- [ ] Model appears in AI model selection list
- [ ] Model can be selected/deselected
- [ ] Cost calculation includes WAN Turbo pricing
- [ ] Model name displays correctly in UI

### Integration Testing
- [ ] Generate video with WAN Turbo (mock mode first)
- [ ] Verify API call format and endpoint
- [ ] Confirm response handling
- [ ] Test video download and media panel integration

### API Testing (with real API key)
- [ ] Test actual generation with WAN Turbo
- [ ] Verify video quality and format
- [ ] Confirm generation time (should be faster than standard WAN)
- [ ] Test error handling for API failures

## Potential Issues & Solutions

### Issue 1: Different Parameter Format
**Symptoms**: API errors or generation failures
**Solution**: Review WAN Turbo API docs for parameter differences
**Files affected**: `lib/ai-video-client.ts`

### Issue 2: Different Response Format
**Symptoms**: Video URL not extracted correctly
**Solution**: Add response format handling similar to existing WAN v2.2
**Files affected**: `lib/ai-video-client.ts` (response parsing section)

### Issue 3: Rate Limiting
**Symptoms**: Generation fails when multiple models selected
**Solution**: Already handled by sequential generation in existing code
**Files affected**: None (existing solution applies)

### Issue 4: Pricing Updates
**Symptoms**: Incorrect cost display
**Solution**: Update price field in AI_MODELS configuration
**Files affected**: `components/editor/media-panel/views/ai.tsx`

## Code Examples

### Model Configuration Example
```typescript
// In AI_MODELS array
{
  id: "wan_turbo",
  name: "WAN v2.2 Turbo",
  description: "High-speed photorealistic video generation with optimized processing",
  price: "0.30", // Adjust based on actual API pricing
  resolution: "1080p",
}
```

### Client Integration Example
```typescript
// In generateVideo function - existing modelEndpoints object
const modelEndpoints: { [key: string]: string } = {
  "seedance": "fal-ai/bytedance/seedance/v1/lite/text-to-video",
  "seedance_pro": "fal-ai/bytedance/seedance/v1/pro/text-to-video", 
  "veo3": "fal-ai/google/veo3",
  "veo3_fast": "fal-ai/google/veo3/fast",
  "hailuo": "fal-ai/minimax/hailuo-02/standard/text-to-video",
  "hailuo_pro": "fal-ai/minimax/hailuo-02/pro/text-to-video",
  "kling_v2": "fal-ai/kling-video/v2.1/master",
  "wan_turbo": "fal-ai/wan/v2.2-a14b/text-to-video/turbo", // Add this line
};

// Existing endpoint resolution logic (lines 111-113):
const endpoint = modelEndpoints[request.model] || "fal-ai/minimax/hailuo-02/standard/text-to-video";
```

## Validation Criteria

### Success Criteria
- [ ] WAN Turbo appears in model selection UI
- [ ] Can select WAN Turbo alone or with other models
- [ ] Cost calculation accurate
- [ ] Video generation works (mock and real)
- [ ] Generated videos appear in media panel
- [ ] No regression in existing models
- [ ] Performance improvement visible (faster generation)

### Acceptance Testing
- [ ] Generate video with WAN Turbo + one other model
- [ ] Verify both videos generated successfully
- [ ] Compare generation times (WAN Turbo should be faster)
- [ ] Confirm video quality meets expectations
- [ ] Test multi-model cost calculation accuracy

## Dependencies

### Required Environment
- Valid `VITE_FAL_API_KEY` in environment variables
- Access to fal.ai WAN Turbo model API
- Existing AI video generation system working

### API Requirements
- Review actual API documentation for:
  - Required parameters
  - Optional parameters  
  - Response format
  - Rate limiting
  - Pricing structure

## Rollback Plan

### If Issues Arise
1. **Immediate**: Comment out WAN Turbo from `AI_MODELS` array
2. **Code Rollback**: Revert changes to `ai-video-client.ts`
3. **Testing**: Verify existing models still work
4. **Investigation**: Debug specific issue with WAN Turbo integration

### Rollback Files
- `apps/web/src/components/editor/media-panel/views/ai.tsx`
- `apps/web/src/lib/ai-video-client.ts`
- `docs/task/ai-video-workflow.md`

## Estimated Time

- **Research & Planning**: 30 minutes
- **Implementation**: 1-2 hours
- **Testing (Mock)**: 30 minutes  
- **API Testing**: 1 hour
- **Documentation**: 30 minutes
- **Total**: 3-4 hours

## Notes

- WAN Turbo is likely similar to existing WAN v2.2 model with speed optimizations
- Should integrate seamlessly with existing multi-model generation workflow
- May have different pricing structure - confirm with API documentation
- Generation speed should be noticeably faster than standard models
- Quality should remain high despite speed optimization

---

**Priority**: Medium  
**Complexity**: Low-Medium  
**Dependencies**: fal.ai API access, existing AI video system  
**Risk Level**: Low (additive change, no modification of existing models)