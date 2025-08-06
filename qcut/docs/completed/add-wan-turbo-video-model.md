# WAN v2.2 Turbo Implementation - Task Breakdown

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

---

# Task 1: Research WAN Turbo API Parameters ✅ COMPLETED
**Estimated Time**: 5 minutes  
**Priority**: High

## API Research Results

### Required Parameters
- `prompt`: Text description (required) ✅ Same as existing models

### Optional Parameters  
- `seed`: Random seed for reproducibility
- `resolution`: "720p" (default), "580p", or "480p" 
- `aspect_ratio`: "16:9" (default), "9:16", or "1:1"
- `enable_safety_checker`: Boolean safety check
- `enable_prompt_expansion`: Boolean prompt enhancement
- `acceleration`: "none" (recommended) or "regular" 
- `guidance_scale`: Prompt adherence (default 3.5)

### Response Format
```json
{
  "video": {
    "url": "https://example.com/generated_video.mp4"
  },
  "prompt": "Original text prompt", 
  "seed": 12345
}
```
✅ **Compatible with existing response handling** - uses `video.url` like other models

### Pricing (Updated)
- **720p**: $0.10 per video
- **580p**: $0.075 per video  
- **480p**: $0.05 per video
📝 **Use $0.10 for model configuration (720p default)**

### Duration & Limits
- **Frames**: 81-121 frames per video
- **FPS**: 4-60 range
- **No fixed duration** - frame-based generation

### Integration Notes
✅ **No special handling needed** - standard FAL.ai response format
✅ **Uses same parameters as existing models** (prompt, resolution)
✅ **Default resolution: 720p** (vs 1080p for other models)

---

# Task 2: Add WAN Turbo to AI Models Array ✅ COMPLETED
**Estimated Time**: 2 minutes  
**Priority**: High  
**File**: `apps/web/src/components/editor/media-panel/views/ai.tsx`

## Changes Made
✅ Added WAN Turbo model to `AI_MODELS` array (lines 106-112):
```typescript
{
  id: "wan_turbo",
  name: "WAN v2.2 Turbo", 
  description: "High-speed photorealistic video generation",
  price: "0.10", // Updated with actual API pricing (720p)
  resolution: "720p", // Corrected from research
}
```

## Validation
✅ **Syntax**: No errors in array structure
✅ **Pricing**: Updated to actual $0.10 (not estimated $0.30)  
✅ **Resolution**: Corrected to 720p (WAN Turbo default)
✅ **Model count**: Now 8 models total (was 7)

**Ready for Task 3: Add endpoint mapping**

---

# Task 3: Add WAN Turbo Endpoint Mapping ✅ COMPLETED
**Estimated Time**: 1 minute  
**Priority**: High  
**File**: `apps/web/src/lib/ai-video-client.ts`

## Changes Made
✅ Added WAN Turbo endpoint to `modelEndpoints` object (line 109):
```typescript
"wan_turbo": "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
```

## Validation
✅ **Syntax**: No errors in object structure
✅ **Endpoint**: Correctly mapped to FAL API endpoint
✅ **Lookup**: Will resolve via `modelEndpoints[request.model]`
✅ **Fallback**: Uses existing fallback if model not found

**WAN Turbo integration complete! Ready for testing.**

## ⚠️ Issue Found & Fixed:
**Problem**: WAN Turbo only accepts "480p", "580p", "720p" but code was sending "1080p"  
**Error**: `Input should be '480p', '580p' or '720p'`  
**Fix**: Added WAN Turbo-specific parameter handling (lines 144-152) to:
- Default to "720p" resolution
- Validate resolution against WAN Turbo's accepted values
- Fallback to "720p" for invalid resolutions

✅ **Fixed**: WAN Turbo now uses correct resolution parameters

---

# Task 4: Test WAN Turbo Model Selection
**Estimated Time**: 3 minutes  
**Priority**: Medium

## Description
Verify model appears and can be selected in UI.

## Steps
1. Run `bun dev` if not already running
2. Navigate to AI video panel
3. Verify WAN Turbo appears in model list
4. Test selecting/deselecting WAN Turbo
5. Verify cost calculation updates
6. Check no console errors

## Success Criteria
- WAN Turbo visible in model list
- Can toggle selection
- Cost updates correctly
- No errors in console

---

# Task 5: Test WAN Turbo Video Generation (Mock)
**Estimated Time**: 5 minutes  
**Priority**: Medium

## Description
Test video generation without actual API call to verify integration.

## Steps
1. In AI video panel, select only WAN Turbo model
2. Enter test prompt: "A cat walking in a garden"
3. Click generate (will fail at API call - this is expected)
4. Verify request reaches correct endpoint in console logs
5. Check for proper error handling

## Success Criteria
- Request sent to correct WAN Turbo endpoint
- Proper error handling displayed
- No crashes or unexpected behavior

---

# Task 6: Update Documentation
**Estimated Time**: 3 minutes  
**Priority**: Low  
**File**: `docs/task/ai-video-workflow.md`

## Description
Add WAN Turbo to the AI video workflow documentation.

## Steps
1. Open `docs/task/ai-video-workflow.md`
2. Find the models section
3. Add new entry:
```markdown
### 8. **WAN v2.2 Turbo** (fal.ai)
- **Quality**: ⭐⭐⭐⭐⭐ (High-resolution with speed optimization)
- **Speed**: ⭐⭐⭐⭐⭐ (Turbo mode)
- **Cost**: ~$0.30 per generation
- **Resolution**: 1080p
- **Best For**: High-quality results with faster generation
- **Provider**: fal.ai
```
4. Save file

## Success Criteria
- Documentation updated
- Model count incremented if needed

---

# Task 7: Test with Real API Key (Optional)
**Estimated Time**: 5 minutes  
**Priority**: Low  
**Requires**: Valid FAL API key with credits

## Description
Test actual video generation with WAN Turbo model.

## Steps
1. Ensure `VITE_FAL_API_KEY` is set in environment
2. Select WAN Turbo model in UI
3. Use simple prompt: "A flower blooming in time lapse"
4. Generate video
5. Verify generation speed is faster than other models
6. Check video quality in media panel

## Success Criteria
- Video generates successfully
- Generation is noticeably faster
- Video appears in media panel
- Video quality is high

---

# Task 8: Multi-Model Generation Test (Optional)
**Estimated Time**: 5 minutes  
**Priority**: Low  
**Requires**: Valid FAL API key with credits

## Description
Test WAN Turbo alongside another model to ensure no interference.

## Steps
1. Select WAN Turbo + one other model (e.g., Kling v2)
2. Use same prompt for both
3. Generate videos
4. Compare generation times
5. Verify both videos appear in media panel
6. Check cost calculation accuracy

## Success Criteria
- Both models generate successfully
- WAN Turbo is faster
- Both videos appear in media panel
- Cost calculation is correct

## Quick Reference - Files Modified

### Primary Files
1. **`apps/web/src/components/editor/media-panel/views/ai.tsx`** (lines 56-106)
   - Add model to `AI_MODELS` array
2. **`apps/web/src/lib/ai-video-client.ts`** (lines 101-109)
   - Add endpoint to `modelEndpoints` object
3. **`docs/task/ai-video-workflow.md`**
   - Update documentation with new model

---

# Implementation Summary

## Total Estimated Time: 19-29 minutes
- **Required Tasks (1-3)**: 8 minutes
- **Testing Tasks (4-5)**: 8 minutes 
- **Optional Tasks (6-8)**: 3-13 minutes

## Task Dependencies
```
Task 1 (Research) → Task 2 (Add Model) → Task 3 (Add Endpoint)
                                      ↓
                     Task 4 (Test Selection) → Task 5 (Test Generation)
                                             ↓
                            Task 6 (Documentation) → Tasks 7-8 (API Testing)
```

## Minimum Viable Implementation
**Complete Tasks 1-3** for basic integration (8 minutes total)

## Recommended Implementation
**Complete Tasks 1-5** for tested integration (16 minutes total)

---

# Testing Checklist (Quick Reference)

## After Task 2-3 (Model Integration)
- [ ] Model appears in selection list
- [ ] No syntax errors in console
- [ ] Can select/deselect model

## After Task 4-5 (Basic Testing)
- [ ] Cost calculation works
- [ ] Mock generation reaches correct endpoint
- [ ] Proper error handling

## After Task 7-8 (API Testing - Optional)
- [ ] Real video generation works
- [ ] Generation is faster than other models
- [ ] Multi-model generation works
- [ ] Videos appear in media panel

---

# Troubleshooting Guide

## Common Issues

### Model Not Appearing in UI
**Cause**: Syntax error in `AI_MODELS` array  
**Fix**: Check console for errors, verify JSON structure

### API Call Goes to Wrong Endpoint
**Cause**: Typo in `modelEndpoints` object  
**Fix**: Verify endpoint string matches API documentation

### Generation Fails
**Cause**: Parameter mismatch or API changes  
**Fix**: Review API docs from Task 1, adjust parameters if needed

### Cost Calculation Wrong
**Cause**: Incorrect price in model configuration  
**Fix**: Update `price` field with actual API pricing

---

# Quick Copy-Paste Reference

## For Task 2 (AI_MODELS array):
```typescript
{
  id: "wan_turbo",
  name: "WAN v2.2 Turbo",
  description: "High-speed photorealistic video generation",
  price: "0.30", // Update with actual pricing from research
  resolution: "1080p",
}
```

## For Task 3 (modelEndpoints object):
```typescript
"wan_turbo": "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
```

## For Task 6 (Documentation):
```markdown
### 8. **WAN v2.2 Turbo** (fal.ai)
- **Quality**: ⭐⭐⭐⭐⭐ (High-resolution with speed optimization)
- **Speed**: ⭐⭐⭐⭐⭐ (Turbo mode)
- **Cost**: ~$0.30 per generation
- **Resolution**: 1080p
- **Best For**: High-quality results with faster generation
- **Provider**: fal.ai
```

---

# Emergency Rollback

## If Something Breaks
1. **Comment out the model from `AI_MODELS` array**:
   ```typescript
   // {
   //   id: "wan_turbo",
   //   name: "WAN v2.2 Turbo", 
   //   ...
   // },
   ```
2. **Comment out the endpoint mapping**:
   ```typescript
   // "wan_turbo": "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
   ```
3. **Restart dev server**: `bun dev`

## Notes
- **Risk Level**: Very Low (additive change only)
- **No existing functionality affected**
- **Each task is independent and reversible**
- **WAN Turbo likely identical to existing FAL.ai models**