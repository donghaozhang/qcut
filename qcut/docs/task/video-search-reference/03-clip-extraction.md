# Clip Extraction — VST Video Clips & Snapshots

## Video Clip API

**Source**: `tools/vst/video_clip.py`

### Endpoint
```
GET /vst/api/v1/storage/file/{stream_id}
  ?startTime={ISO or offset seconds}
  &endTime={ISO or offset seconds}
  &container=mp4
  &disableAudio=true
  &configuration={JSON overlay config}
```

### Two Timestamp Modes (config-driven)

| Mode | Input | Conversion |
|------|-------|-----------|
| **Offset** (default) | Float seconds since stream start | Fetch timeline → compute ISO → call API |
| **ISO** | ISO 8601 UTC strings | Direct pass-through |

### Overlay Configuration (optional)

For bounding box visualization on clips:
```json
{
  "overlay": {
    "bbox": {
      "showAll": false,
      "objectId": ["obj_1", "obj_2"]
    },
    "color": "green",
    "thickness": 5,
    "opacity": 254
  }
}
```

## Snapshot API

**Source**: `tools/vst/snapshot.py`

Single-frame screenshot extraction:

```
GET /vst/api/v1/storage/{stream_id}/snapshot
  ?time={timestamp}
  &configuration={overlay config}
```

Helper function:
```python
def build_screenshot_url(vst_external_url, stream_id, start_time) -> str:
    # → http://{VST_EXTERNAL}/vst/api/v1/storage/{stream_id}/snapshot?time=...
```

## Timeline API

**Source**: `tools/vst/timeline.py`

Retrieves video duration and time boundaries:

```python
def get_timeline(sensor_id, vst_url) -> (start_time, end_time):
    # GET /vst/api/v1/storage/file/{sensor_id}/timeline
    # Returns ISO 8601 start and end times
```

Used by clip extraction to convert offset seconds → ISO timestamps.

## Typical Clip Generation Flow

```
Search result (start_time, end_time, sensor_id)
  → Fetch timeline for offset-to-ISO conversion
  → Call VST clip API with time range
  → Get back mp4 URL
  → Optionally apply overlay config for bbox visualization
  → Return clip URL to frontend
```

Clips typically include **5-second padding** around the matched segment.
