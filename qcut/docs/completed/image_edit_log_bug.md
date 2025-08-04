🔄 Uploading image to FAL...
index-BQxGqh2i.js:676 📤 UPLOAD: Starting upload process for: {fileName: '173224693712221b94e4bc87ce9922b6cf7ad5417f_thumbnail_405x.webp', fileSize: 19318, fileType: 'image/webp'}
index-BQxGqh2i.js:676 🔄 UPLOAD: Attempting FAL storage upload...
index-BQxGqh2i.js:676  POST https://fal.run/storage/upload 404 (Not Found)
A0e @ index-BQxGqh2i.js:676
N @ index-BQxGqh2i.js:676
Pt @ index-BQxGqh2i.js:78
fk @ index-BQxGqh2i.js:78
hy @ index-BQxGqh2i.js:78
nq @ index-BQxGqh2i.js:78
kO @ index-BQxGqh2i.js:90
KH @ index-BQxGqh2i.js:90
OO @ index-BQxGqh2i.js:90
XH @ index-BQxGqh2i.js:90
(anonymous) @ index-BQxGqh2i.js:90
OC @ index-BQxGqh2i.js:174
pk @ index-BQxGqh2i.js:78
b1 @ index-BQxGqh2i.js:90
wB @ index-BQxGqh2i.js:78
n1 @ index-BQxGqh2i.js:78
CB @ index-BQxGqh2i.js:78
index-BQxGqh2i.js:676 ⚠️ UPLOAD: FAL storage upload failed, falling back to base64: {status: 404, error: `{"detail": "User 'storage' not found"}`}
A0e @ index-BQxGqh2i.js:676
await in A0e
N @ index-BQxGqh2i.js:676
Pt @ index-BQxGqh2i.js:78
fk @ index-BQxGqh2i.js:78
hy @ index-BQxGqh2i.js:78
nq @ index-BQxGqh2i.js:78
kO @ index-BQxGqh2i.js:90
KH @ index-BQxGqh2i.js:90
OO @ index-BQxGqh2i.js:90
XH @ index-BQxGqh2i.js:90
(anonymous) @ index-BQxGqh2i.js:90
OC @ index-BQxGqh2i.js:174
pk @ index-BQxGqh2i.js:78
b1 @ index-BQxGqh2i.js:90
wB @ index-BQxGqh2i.js:78
n1 @ index-BQxGqh2i.js:78
CB @ index-BQxGqh2i.js:78
index-BQxGqh2i.js:676 🔄 UPLOAD: Using base64 data URL fallback...
index-BQxGqh2i.js:676 ✅ UPLOAD: Image converted to base64 data URL for FAL API
index-BQxGqh2i.js:676 🔍 UPLOAD: Data URL format: {type: 'string', length: 25783, startsWithData: true, prefix: 'data:image/webp;base64,UklGRm5', mimeType: 'data:image/webp'}
index-BQxGqh2i.js:676 🎨 Generating edit with: {imageUrl: 'data:image/webp;base64,UklGRm5LAABXRUJQVlA4WAoAAAA…+3/WXEIQdUyB+pjm2WxvlWUv4ZEAAAAAAm+BwUBefXr8QAA==', prompt: 'blue dress', model: 'flux-kontext', guidanceScale: 1, steps: 20, …}
index-BQxGqh2i.js:676 🎨 Editing image with flux-kontext: {prompt: 'blue dress', image_url: 'data:image/webp;base64,UklGRm5LAABXRUJQVlA4WAoAAAA...', guidance_scale: 1, num_inference_steps: 20, safety_tolerance: 2, …}
index-BQxGqh2i.js:676 🔍 DEBUG: Image URL details: {type: 'string', length: 25783, startsWithData: true, startsWithHttps: false, firstChars: 'data:image/webp;base'}
index-BQxGqh2i.js:676 ✅ FAL API response: {
  "images": [
    {
      "url": "https://fal.media/files/panda/Qwt4XDjfRV6tDra7U8L7P_430195e11732433894312d7b72dc61f9.jpg",
      "content_type": "image/jpeg",
      "file_name": null,
      "file_size": null,
      "width": 880,
      "height": 1184
    }
  ],
  "timings": {},
  "seed": 2247286637,
  "has_nsfw_concepts": [
    false
  ],
  "prompt": "blue dress"
}
index-BQxGqh2i.js:676 🎯 Using direct mode with images: 1
index-BQxGqh2i.js:676 📥 Downloading edited image to media library... {resultUrl: 'https://fal.media/files/panda/Qwt4XDjfRV6tDra7U8L7P_430195e11732433894312d7b72dc61f9.jpg', projectId: 'f0dfdb3f-a96d-4e1e-a092-fc15da37452e'}
index-BQxGqh2i.js:676 🔄 Starting download process... {filename: 'edited_flux-kontext_2025-08-04T05-46-29-976Z.jpg'}
index-BQxGqh2i.js:676 Refused to connect to 'https://fal.media/files/panda/Qwt4XDjfRV6tDra7U8L7P_430195e11732433894312d7b72dc61f9.jpg' because it violates the following Content Security Policy directive: "connect-src 'self' app: http://localhost:8080 ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com https://fal.run".

z0e @ index-BQxGqh2i.js:676
N @ index-BQxGqh2i.js:676
await in N
Pt @ index-BQxGqh2i.js:78
fk @ index-BQxGqh2i.js:78
hy @ index-BQxGqh2i.js:78
nq @ index-BQxGqh2i.js:78
kO @ index-BQxGqh2i.js:90
KH @ index-BQxGqh2i.js:90
OO @ index-BQxGqh2i.js:90
XH @ index-BQxGqh2i.js:90
(anonymous) @ index-BQxGqh2i.js:90
OC @ index-BQxGqh2i.js:174
pk @ index-BQxGqh2i.js:78
b1 @ index-BQxGqh2i.js:90
wB @ index-BQxGqh2i.js:78
n1 @ index-BQxGqh2i.js:78
CB @ index-BQxGqh2i.js:78
index-BQxGqh2i.js:676 Fetch API cannot load https://fal.media/files/panda/Qwt4XDjfRV6tDra7U8L7P_430195e11732433894312d7b72dc61f9.jpg. Refused to connect because it violates the document's Content Security Policy.
z0e @ index-BQxGqh2i.js:676
N @ index-BQxGqh2i.js:676
await in N
Pt @ index-BQxGqh2i.js:78
fk @ index-BQxGqh2i.js:78
hy @ index-BQxGqh2i.js:78
nq @ index-BQxGqh2i.js:78
kO @ index-BQxGqh2i.js:90
KH @ index-BQxGqh2i.js:90
OO @ index-BQxGqh2i.js:90
XH @ index-BQxGqh2i.js:90
(anonymous) @ index-BQxGqh2i.js:90
OC @ index-BQxGqh2i.js:174
pk @ index-BQxGqh2i.js:78
b1 @ index-BQxGqh2i.js:90
wB @ index-BQxGqh2i.js:78
n1 @ index-BQxGqh2i.js:78
CB @ index-BQxGqh2i.js:78
index.html#/editor/f0dfdb3f-a96d-4e1e-a092-fc15da37452e:1 Refused to load the image 'https://fal.media/files/panda/Qwt4XDjfRV6tDra7U8L7P_430195e11732433894312d7b72dc61f9.jpg' because it violates the following Content Security Policy directive: "img-src 'self' blob: data: app: https://fal.run https://v3.fal.media".

index-BQxGqh2i.js:676 ❌ Failed to add edited image to media library: Error: Failed to download image as file: TypeError: Failed to fetch
    at z0e (index-BQxGqh2i.js:676:52528)
    at async N (index-BQxGqh2i.js:676:97729)
N @ index-BQxGqh2i.js:676
await in N
Pt @ index-BQxGqh2i.js:78
fk @ index-BQxGqh2i.js:78
hy @ index-BQxGqh2i.js:78
nq @ index-BQxGqh2i.js:78
kO @ index-BQxGqh2i.js:90
KH @ index-BQxGqh2i.js:90
OO @ index-BQxGqh2i.js:90
XH @ index-BQxGqh2i.js:90
(anonymous) @ index-BQxGqh2i.js:90
OC @ index-BQxGqh2i.js:174
pk @ index-BQxGqh2i.js:78
b1 @ index-BQxGqh2i.js:90
wB @ index-BQxGqh2i.js:78
n1 @ index-BQxGqh2i.js:78
CB @ index-BQxGqh2i.js:78
index-BQxGqh2i.js:676 Error details: {name: 'Error', message: 'Failed to download image as file: TypeError: Failed to fetch', stack: 'Error: Failed to download image as file: TypeError…apps/web/dist/assets/index-BQxGqh2i.js:676:97729)'}
N @ index-BQxGqh2i.js:676
await in N
Pt @ index-BQxGqh2i.js:78
fk @ index-BQxGqh2i.js:78
hy @ index-BQxGqh2i.js:78
nq @ index-BQxGqh2i.js:78
kO @ index-BQxGqh2i.js:90
KH @ index-BQxGqh2i.js:90
OO @ index-BQxGqh2i.js:90
XH @ index-BQxGqh2i.js:90
(anonymous) @ index-BQxGqh2i.js:90
OC @ index-BQxGqh2i.js:174
pk @ index-BQxGqh2i.js:78
b1 @ index-BQxGqh2i.js:90
wB @ index-BQxGqh2i.js:78
n1 @ index-BQxGqh2i.js:78
CB @ index-BQxGqh2i.js:78
index-BQxGqh2i.js:676 ✅ Edit completed successfully! {resultUrl: 'https://fal.media/files/panda/Qwt4XDjfRV6tDra7U8L7P_430195e11732433894312d7b72dc61f9.jpg', processingTime: 6.995, seedUsed: 2247286637}