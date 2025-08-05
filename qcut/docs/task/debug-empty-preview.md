# Debug Empty Preview Panel Issue

## Problem
- Video elements have proper dimensions (320x180px)
- Media processing successful (2 videos loaded)
- Timeline shows video thumbnails at current position
- Preview panel is completely black/empty
- No console errors

## Hypothesis
The `getActiveElements()` function might not be finding any elements at the current time position, resulting in an empty preview.

## Debug Console Logs to Add

### 1. Check activeElements calculation
```javascript
// In preview-panel.tsx - after getActiveElements() call
console.log('[PreviewPanel] Debug activeElements:', {
  currentTime,
  tracksCount: tracks.length,
  mediaItemsCount: mediaItems.length,
  activeElementsCount: activeElements.length,
  activeElements: activeElements.map(({element}) => ({
    id: element.id,
    name: element.name,
    startTime: element.startTime,
    endTime: element.startTime + element.duration,
    currentTime
  }))
});
```

### 2. Check tracks and timeline elements
```javascript
// In getActiveElements function
console.log('[PreviewPanel] Checking tracks:', {
  currentTime,
  tracks: tracks.map(track => ({
    id: track.id,
    elementsCount: track.elements.length,
    elements: track.elements.map(el => ({
      id: el.id,
      name: el.name,
      startTime: el.startTime,
      duration: el.duration,
      endTime: el.startTime + el.duration,
      isActive: currentTime >= el.startTime && currentTime < el.startTime + el.duration
    }))
  }))
});
```

### 3. Check media items linking
```javascript
// In getActiveElements function - for each active element
console.log('[PreviewPanel] Element media lookup:', {
  elementId: element.id,
  elementMediaId: element.mediaId,
  elementName: element.name,
  foundMediaItem: !!mediaItem,
  mediaItemUrl: mediaItem?.url,
  mediaItemType: mediaItem?.type
});
```

### 4. Check renderElement calls
```javascript
// In renderElement function
console.log('[PreviewPanel] Rendering element:', {
  elementId: element.id,
  elementName: element.name,
  elementType: element.type,
  mediaItemType: mediaItem?.type,
  mediaItemUrl: mediaItem?.url?.substring(0, 50) + '...',
  hasPoster: !!mediaItem?.thumbnailUrl
});
```

### 5. Check VideoPlayer props
```javascript
// In VideoPlayer component
console.log('[VideoPlayer] Initializing with props:', {
  hasSrc: !!src,
  srcPreview: src?.substring(0, 50) + '...',
  hasPoster: !!poster,
  clipStartTime,
  trimStart,
  trimEnd,
  clipDuration
});
```

## Expected Findings

1. **If activeElements.length === 0**: Timeline positioning or time calculation issue
2. **If activeElements found but no mediaItems**: Media linking problem
3. **If elements found but renderElement not called**: React rendering issue
4. **If VideoPlayer not receiving props**: Component prop passing issue
5. **If VideoPlayer gets props but no display**: CSS/styling issue

## Next Steps Based on Console Output

- **Empty activeElements**: Check timeline store currentTime vs element startTime/duration
- **Missing mediaItems**: Check media store loading and ID matching
- **Rendering issues**: Check React component lifecycle and prop passing
- **Display issues**: Check CSS positioning, opacity, z-index