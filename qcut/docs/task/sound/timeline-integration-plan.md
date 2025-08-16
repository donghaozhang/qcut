# Sound Timeline Integration Plan

## Task 7.1 Findings: Timeline Integration Points Analysis

### Current Timeline Architecture

#### Track Types (timeline.ts:4)
```typescript
export type TrackType = "media" | "text" | "audio" | "sticker" | "captions";
```
✅ **`audio` track type already exists** - sounds can use this track type

#### Key Timeline Functions (timeline-store.ts)
1. **`addTrack(type: TrackType): string`** - Creates new track and returns ID
2. **`addElementToTrack(trackId: string, element: CreateTimelineElement)`** - Adds element to specific track  
3. **`addMediaAtTime(item: MediaItem, currentTime: number)`** - High-level function for adding media items
4. **`findOrCreateTrack(trackType: TrackType): string`** - Finds existing track or creates new one

#### Media Integration Pattern (media.tsx:400-404)
```typescript
onAddToTimeline={(currentTime) =>
  useTimelineStore.getState().addMediaAtTime(item, currentTime)
}
```

## Task 7.2: Sound Import Workflow Plan

### Workflow Overview
```
Sound Search → Select → Preview → Add to Timeline → Audio Track → Timeline Element
```

### Detailed Integration Steps

#### Step 1: Sound Item Structure
Sounds from Freesound API need to be converted to MediaItem format:
```typescript
interface SoundMediaItem {
  id: string;           // Freesound ID
  name: string;         // Sound name
  type: "audio";        // MediaType
  file: File;          // Downloaded audio file
  url: string;         // Blob URL for playback
  duration: number;     // Audio duration in seconds
  metadata?: {
    freesoundId: string;
    username: string;
    license: string;
    tags: string[];
  };
}
```

#### Step 2: Add Sound to Media Store
Before adding to timeline, sound must exist in MediaStore:
```typescript
const mediaStore = useMediaStore.getState();
await mediaStore.addMediaItem(soundMediaItem);
```

#### Step 3: Add Sound to Timeline
Two approaches available:

**Option A: Use existing `addMediaAtTime`** (RECOMMENDED)
```typescript
// In sounds.tsx component
const addSoundToTimeline = (sound: SoundMediaItem, currentTime: number) => {
  const timelineStore = useTimelineStore.getState();
  const success = timelineStore.addMediaAtTime(sound, currentTime);
  
  if (success) {
    toast.success(`Added "${sound.name}" to timeline`);
  }
};
```

**Option B: Direct track management** (More control)
```typescript
const addSoundToTimeline = (sound: SoundMediaItem, currentTime: number) => {
  const timelineStore = useTimelineStore.getState();
  
  // Find or create audio track
  const audioTrackId = timelineStore.findOrCreateTrack("audio");
  
  // Add element to track
  timelineStore.addElementToTrack(audioTrackId, {
    type: "media",
    mediaId: sound.id,
    name: sound.name,
    duration: sound.duration,
    startTime: currentTime,
    trimStart: 0,
    trimEnd: 0,
  });
  
  toast.success(`Added "${sound.name}" to audio track`);
};
```

### Implementation Strategy

#### Phase 1: Basic Integration
1. **Sound Component Button**: Add "Add to Timeline" button to each sound result
2. **Get Current Playback Time**: Use `usePlaybackStore.getState().currentTime`
3. **Add to MediaStore First**: Ensure sound exists as MediaItem
4. **Use `addMediaAtTime`**: Leverage existing timeline integration

#### Phase 2: Enhanced UX
1. **Drag and Drop**: Enable dragging sounds to timeline (like media items)
2. **Preview Before Add**: Let users preview sound before adding
3. **Multiple Track Support**: Allow adding to specific audio tracks
4. **Batch Operations**: Add multiple sounds at once

### Code Integration Points

#### In sounds.tsx component:
```typescript
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { useMediaStore } from "@/stores/media-store";

const SoundsView = () => {
  const addSoundToTimeline = async (sound: FreesoundResult) => {
    try {
      // 1. Download and convert to MediaItem
      const soundMediaItem = await convertSoundToMediaItem(sound);
      
      // 2. Add to media store
      const mediaStore = useMediaStore.getState();
      await mediaStore.addMediaItem(soundMediaItem);
      
      // 3. Get current playback time
      const currentTime = usePlaybackStore.getState().currentTime;
      
      // 4. Add to timeline using existing function
      const success = useTimelineStore.getState().addMediaAtTime(
        soundMediaItem, 
        currentTime
      );
      
      if (success) {
        toast.success(`Added "${sound.name}" to timeline`);
      }
    } catch (error) {
      console.error("Failed to add sound to timeline:", error);
      toast.error("Failed to add sound to timeline");
    }
  };
  
  // Render sound with add button
  return (
    <Button onClick={() => addSoundToTimeline(sound)}>
      Add to Timeline
    </Button>
  );
};
```

### Key Advantages of This Approach

1. **Reuses Existing Infrastructure**: Leverages `addMediaAtTime` function
2. **Consistent with Media Workflow**: Sounds behave like other media items
3. **Audio Track Support**: Automatically uses audio tracks (line 1471: `item.type === "audio" ? "audio" : "media"`)
4. **Overlap Detection**: Built-in collision detection (line 1477)
5. **Undo/Redo Support**: Timeline history automatically managed

### Testing Strategy

1. **Unit Tests**: Test sound conversion to MediaItem format
2. **Integration Tests**: Test full workflow from search to timeline
3. **UI Tests**: Test button interactions and drag-drop
4. **Timeline Tests**: Verify sounds appear correctly on audio tracks

### Risk Mitigation

- **API Rate Limits**: Handled by existing rate limiting in API route
- **File Download Failures**: Add proper error handling and fallbacks  
- **Timeline Conflicts**: Leverage existing overlap detection
- **Memory Management**: Use blob URL cleanup for large audio files

## Implementation Timeline

- **Phase 1** (15 minutes): Basic "Add to Timeline" button functionality
- **Phase 2** (30 minutes): Enhanced UX with drag-drop and preview
- **Phase 3** (15 minutes): Polish and error handling

## Success Criteria

✅ Sounds can be searched and previewed  
✅ Sounds can be added to timeline with one click  
✅ Sounds appear on audio tracks correctly  
✅ Timeline playback includes sound audio  
✅ Existing timeline functionality unaffected  