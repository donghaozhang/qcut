# FFmpeg Binary Resources

## Required Files

This directory should contain the FFmpeg binary for native CLI integration:

- `ffmpeg.exe` (Windows) - Download from https://ffmpeg.org/download.html

## Download Instructions

1. Go to https://ffmpeg.org/download.html
2. Click "Windows" and select "Windows builds by BtbN"
3. Download "ffmpeg-master-latest-win64-gpl.zip"
4. Extract the zip file
5. Copy `ffmpeg.exe` from `bin/` folder to this directory
6. The final path should be: `qcut/electron/resources/ffmpeg.exe`

## Build Integration

The `package.json` is configured to bundle this binary in the Electron distribution:

```json
"extraResources": [
  {
    "from": "electron/resources/",
    "to": "resources/",
    "filter": ["ffmpeg.exe"]
  }
]
```

## Path Detection

The `ffmpeg-handler.js` will automatically detect the correct path:
- Development: `electron/resources/ffmpeg.exe` or system PATH
- Production: `resources/ffmpeg.exe` (bundled in app)

## Hardware Acceleration

FFmpeg CLI supports hardware acceleration for even faster encoding:
- NVENC (NVIDIA GPUs): `-c:v h264_nvenc`
- Quick Sync (Intel): `-c:v h264_qsv`
- AMD VCE: `-c:v h264_amf`

The current implementation uses software encoding for maximum compatibility.