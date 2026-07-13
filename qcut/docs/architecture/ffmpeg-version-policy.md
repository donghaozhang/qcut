# FFmpeg Version Policy

## Native desktop

QCut desktop packages use FFmpeg and FFprobe 8.1.2 on every supported native
target. `scripts/ffmpeg-binaries.json` is the only source of binary URLs,
archive SHA256 digests, required build flags, and platform hardware acceleration
checks.

Changing a URL, digest, version token, codec capability, or hardware capability
invalidates the staged-binary receipt. Release builds must execute the host
binary and verify its version, build configuration, and hardware accelerators.
Non-host targets receive the same static version and build-flag checks before
packaging.

## WebAssembly

FFmpeg.wasm remains on `@ffmpeg/core` 0.12.10, whose upstream build uses FFmpeg
5.1.4. This is an explicit compatibility boundary rather than part of the
native 8.1.2 rollout. Moving the WebAssembly core to FFmpeg 8 requires a
separate custom-build project with browser codec, memory, worker, export, and
performance regression coverage.

The WebAssembly package version and underlying FFmpeg version are recorded in
the native manifest so dependency changes cannot silently imply that the core
was upgraded.
