# Independent cinematic soft glow in C++20

Readable, standalone CPU reconstruction of one Jianying filter's instantiated algorithm graph. The library and CLI use only the C++ standard library. No Jianying dylib, shader runtime, Lua, GPU API, or QCut dependency is used during compilation or rendering.

See [Chinese build and validation report](README.zh.md), [algorithm explanation](algorithm.zh.md), and [graph evidence](graph-evidence.zh.md).

The [semantic contract](semantic-contract.zh.md) and its [machine-readable JSON](semantic-contract.json) define the dataflow, units, formulas, channel layouts and lifecycle boundaries independently of the C++ implementation. Three inputs with nine single-factor substitutions plus a baseline produced 30 outputs: each substitution increased error against the fixed native reference. Those historical results apply to the static scene and provider output blending. A separate `ui-snapshot` intensity mode reconstructs measured editor export behavior without repairing or executing vendor scripts.

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j4
ctest --test-dir build --output-on-failure
./build/soft-glow --demo --output demo.ppm
```

The self-contained demo generates its own chart and identity LUT. To reproduce the measured color treatment, supply the corresponding private 512×512 RGBA8 LUT atlas explicitly:

```sh
./build/soft-glow --input input.rgba --width 320 --height 180 \
  --lut reference-map2.rgba --intensity 1 --output output.rgba --trace stages
```

Raw images are opaque, top-down, tightly packed RGBA8 SDR. The static library exposes `cinematic_soft_glow(PipelineRequest)`. The graph consists of Gaussian downsample/convolution/upsample, a centered 103% SoftLight layer, one glow node with separately packed RG/BA blur branches, a tiled 64-cube LUT, and a final Normal layer.

Both CLIs accept `--intensity-mode output-mix|ui-snapshot`. The default `output-mix` blends the complete effect with the input and preserves the measured local CGL provider contract. `ui-snapshot` uses threshold `1−0.175t` and brightness `3t` for `t≤0.8`, otherwise the scene values `0.84` and `2.4`; LUT opacity is `0.8t`. SoftLight and Normal stay fixed, with no final output blend. Zero therefore retains SoftLight, and 100% is byte-identical across modes. See the [intensity contract and evidence](intensity-modes.zh.md) and [stream protocol](stream.zh.md).

Release and Address/UndefinedBehavior sanitizer tests passed on macOS arm64 with AppleClang 21. Nine algorithm groups, stream tests and optional Python CLI tests cover the two modes, zero behavior, the 80/81 boundary, invocation order and protocol validation, alongside the numerical checks. Historical `output-mix` results for three synthetic inputs at 100% and 37% produced RGB MAE **0.006540–0.054485 out of 255**, maximum channel error **6**, and zero alpha error against stable native references. The new default executable reproduces all six historical output hashes; those historical source hashes still identify their original build. This is not a bit-exact native claim or a complete editor/export acceptance result.

The source contains no vendor LUT, binary, shader, Lua, or model. The LUT is an external art asset; the identity demo is fully self-contained. Real-video processing and editor intensity observations are reported separately in the linked reports. Transparent pipeline inputs, HDR, complete package-event execution, arbitrary layer transforms, and cross-platform runtime equivalence remain outside this validation.
