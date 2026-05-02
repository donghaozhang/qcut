# Seedance 2.0 — Avatar / Character Library

The supported paths for putting a face into a Seedance 2.0 video. All three workarounds for the [face filter](./02-capabilities.md#real-face-restriction-and-its-workarounds) ultimately resolve to one mechanism: pass an `asset://<asset_id>` URI in `content.image_url.url` instead of a base64 / public URL.

## URI format

```python
{
    "type": "image_url",
    "image_url": {"url": "asset://asset-20260222234430-mxpgh"},  # real example from BytePlus docs
    "role": "first_frame",  # or "reference_image" / "last_frame"
}
```

The `asset://` scheme is treated as pre-authorized — the visual face filter that rejects raw uploads does not trigger.

## Prerequisite — activate the Asset Service (verified 2026-05-02)

Before any `asset://...` URI works, the account must activate the **Asset Service**. We probed this with [`test-seedance-avatar.sh`](./test-seedance-avatar.sh) using the URI from the docs (`asset://asset-20260222234430-mxpgh`) and the hackathon key, and received:

```
HTTP 400 Bad Request
{
  "error": {
    "code":    "InvalidParameter",
    "param":   "content[1].image_url.url",
    "message": "The parameter `content[1].image_url.url` specified in the request is not valid: Your account has not activated the Asset Service. You may activate it at https://console.byteplus.com/ark/region:ark+ap-southeast-1/openManagement?...&advancedActiveKey=model.",
    "type":    "BadRequest"
  }
}
```

Two important takeaways:

- **The URI format itself is recognized.** No "malformed URI" error — the API accepted `asset://asset-20260222234430-mxpgh` as syntactically valid and rejected it on entitlement, not on shape.
- **Activation is account-scoped.** Visit the activation URL in the console while logged in to whichever BytePlus account holds the API key. Once Asset Service is enabled, the same key unlocks both libraries (Virtual Character + Real-Human) and the 30-day output reuse path.

The error code is stable as `InvalidParameter` with the substring `"has not activated the Asset Service"` in the message — branch on the substring (the top-level code is shared with other invalid-parameter errors).

## Library 1 — Virtual Character Library (zero consent friction)

Pre-built virtual avatars. No custom uploads, no real faces — but they're trusted assets you can drop straight into a generation.

| Field | Value |
|---|---|
| Where | [Model Playground → **Virtual character Library** tab](https://console.byteplus.com/ark/region:ark+ap-southeast-1/experience/vision?modelId=seedance-2-0-260128&tab=GenVideo) |
| Status | Beta — submit a [BytePlus ticket](https://console.byteplus.com/workorder/create?step=2&SubProductID=P00001514) to activate |
| Contents | Virtual character images + non-portrait assets |
| Custom upload | ❌ — platform-provided only |
| Cross-account | All assets are platform-shared (any activated account can use any character) |
| First-time gate | Must accept the [ModelArk AI Playground User Terms](https://docs.byteplus.com/en/docs/legal/tos_modelark_playground) |
| Real-human characters | ❌ — explicitly: "Currently, generating videos using real human images is not supported. It is recommended to use the virtual characters provided by the platform." |

### Browse → use flow

1. Open Model Playground (link above) → click the **Virtual character Library** tab below the input box.
2. Search by natural language (e.g., `"male CEO in a suit"`, `"anime girl with red hair"`) or browse.
3. Hover a character → click **View virtual character details** to see tags and profile.
4. **Copy asset ID** icon (top-right of the details panel) → asset ID lands in your clipboard.
5. In API: `image_url.url = f"asset://{asset_id}"`. Or in Playground: click **Use** and reference the character in the prompt as `@Image1`.

### Default Playground behaviour to watch for

> By default, each request generates **four video clips**. To reduce costs, we recommend generating **one clip per request**.

This applies to the Playground UI; API calls already generate one clip per `tasks.create` call.

## Library 2 — Real-Human Asset Library (consent + verification, real faces allowed)

The official path for "this specific real person doing X." Heavyweight onboarding but unlocks face-bearing reference assets.

| Field | Value |
|---|---|
| Where | Model Playground → **My assets** → **Real-human** → **Add real-human assets** |
| Account gate | Account must complete real-name or enterprise authentication first |
| Privacy | Assets are private to the authorizing account; "a dedicated asset group will be generated for each artist for unified management" |
| Multi-actor | One account can hold multiple authorized real-person identities |
| Asset URI format | `asset://asset-20260222234430-mxpgh` (same shape as virtual characters) |

### Onboarding flow

1. **Asset user (you)** opens *Model Playground → My assets → Real-human → Add real-human assets*.
2. Generate an **authorization QR code** with a validity window.
3. **Actor (the real person)** scans the QR with their own phone, logs into **their own BytePlus account**, completes:
   - Agreement to *Personal Information Processing Rules*
   - Agreement to *facial information processing and authorization rules*
   - **Real-person verification** (live face check)
   - Uploads their reference materials (images / videos)
4. **Asset user** receives the authorized materials in console and accepts them — they appear in the asset group as a private asset.
5. Use as `asset://<asset_id>` in API calls.

This is the path Seedance 2.0 docs reference as "authorized real-person assets" in the [official face-restriction warning](./02-capabilities.md#real-face-restriction-and-its-workarounds).

## Library 3 — Reuse your own past Seedance 2.0 outputs

A third workaround that doesn't require either library:

> ModelArk trusts face-containing videos generated by the seedance 2.0 and 2.0 Fast models. You can use the original face-containing videos generated by the above models under your account within the past 30 days as input assets for video generation.
> — [Create task API reference](https://docs.byteplus.com/en/docs/ModelArk/1520757)

So if Seedance 2.0 generates a person's face in a text-to-video output, you can feed that output back in as `video_url` to extend or edit it for **30 days from `created_at`**. After 30 days the trust expires and the same video would be rejected like a fresh upload.

## Quick decision matrix

| Goal | Use |
|---|---|
| Stock virtual avatar in seconds | Virtual Character Library — copy asset ID |
| Real specific person, with their consent | Real-Human Asset Library — QR-code onboarding |
| Continue / extend an existing Seedance 2.0 output that has a face | Pass the original `video_url` within 30 days of `created_at` |
| Real specific person, *without* their direct consent | ❌ Not supported — this is what the face filter is enforcing |

## Sources

- [Digital character library](https://docs.byteplus.com/en/docs/ModelArk/2223965) — virtual character browsing and asset URI usage
- [Add real-human assets to asset library](https://docs.byteplus.com/en/docs/ModelArk/2315856) — QR-code onboarding flow and consent rules
- [Create video generation task](https://docs.byteplus.com/en/docs/ModelArk/1520757) — `image_url.url` accepting `asset://...` URIs and the 30-day reuse rule
- [ModelArk AI Playground User Terms](https://docs.byteplus.com/en/docs/legal/tos_modelark_playground)
