# MediaPipe person cutout assets

These files are checked in so the packaged Electron app can run person cutout
without a CDN connection.

- `vision_bundle.cjs.js` and `wasm/` come from `@mediapipe/tasks-vision@0.10.35`.
- `../models/person-segmentation.tflite` is MediaPipe's
  `selfie_multiclass_256x256` float32 model, version 1:
  `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite`
- Model SHA-256: `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`.
