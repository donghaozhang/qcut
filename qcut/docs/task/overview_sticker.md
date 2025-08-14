sequenceDiagram
  participant U as User
  participant MP as Media Panel
  participant PS as Playback Store
  participant TL as Timeline Store
  participant SO as Stickers Overlay Store

  U->>MP: select "Add as Overlay" on media item
  MP->>PS: read currentTime
  MP->>TL: read totalDuration
  MP->>SO: addOverlaySticker(mediaItemId, { startTime, endTime })
  SO-->>U: show success toast

sequenceDiagram
  participant U as User
  participant SC as StickerCanvas
  participant MS as Media Store
  participant SO as Stickers Overlay Store
  participant TL as Timeline Store

  U->>SC: drop media item onto canvas
  SC->>MS: validate media item
  SC->>SO: addOverlaySticker({ position, timing })
  SO->>TL: ensure sticker track exists and insert sticker element

sequenceDiagram
  participant EE as ExportEngine
  participant SO as Stickers Overlay Store
  participant MS as Media Store
  participant SE as StickerExportHelper

  EE->>EE: renderFrame(t)
  EE->>SO: getVisibleStickersAtTime(t)
  EE->>MS: build media items map
  EE->>SE: renderStickersToCanvas(ctx, stickers, mediaMap, opts)
  SE-->>EE: stickers rendered onto canvas
