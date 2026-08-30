# Local Algorithm Probe Status

> Target: Jianying Pro for macOS 11.3.0
>
> Probe sources: `research/jianying-basic-video-probe/`
>
> Private libraries, models, real input frames, and outputs stay in local ignored directories and are never committed or distributed.

## Validation levels

| Level | Meaning |
| --- | --- |
| `discovered` | Required artifacts and entry points were located. |
| `runtime-callable` | An isolated process constructed and released a real algorithm object. |
| `model-loaded` | The private runtime parsed a real model or GPU program. |
| `input-processed` | Real input produced structurally valid output. |

Lower levels do not imply higher ones. A client symbol is not proof of local execution, and model loading is not proof of pixel quality.

## Results

| Capability | Locality | Level | Verified boundary |
| --- | --- | --- | --- |
| Deflicker | Confirmed local | `model-loaded` | Lens factory plus Deflicker Metal library |
| Stabilization | Confirmed local | `runtime-callable` | VAS factory construction and release |
| ByteNN denoise | Confirmed local | `model-loaded` | `nn_denoise.bytenn` parsed by ByteNN |
| UMVFI interpolation | Confirmed local | `model-loaded` | UMVFI factory plus Metal library |
| Optical-flow motion blur | Confirmed local | `runtime-callable` | VMB factory construction and release |
| Smart motion | Confirmed local | `input-processed` | Five real masks converted to inspectable QCut keyframes |
| Smart crop | Confirmed local | `input-processed` | Real 360x640 mask converted to a 9:16 crop |
| Camera tracking | Confirmed local | `model-loaded` | Bingo ObjectTracking model initialization |
| Eye correction | Confirmed local | `runtime-callable` | Eye models present; Bach/Amazing model-root initialization |
| AI super resolution | Local provider unresolved | `discovered` | Client exists, explicit upload path exists, no identifiable local model found |

## App-independent run

The first nine probes were rerun without any `/Applications/VideoFusion-macOS.app` path. They used only:

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current/Frameworks
~/Library/Application Support/QCut/PrivateRuntimes/JianyingBasicVideo/current/Models
```

The process environment was cleared with `env -i`. All seven native modes succeeded, and one crop mask plus five motion masks were byte-identical to the outputs produced from the application paths. The machine-readable report is local-only:

```text
.local/jianying-basic-video-probe/app-independent/report.json
```

This proves local execution after a private on-device backup. It does not grant redistribution rights: Jianying libraries and models must not enter Git, QCut packages, or public downloads.

AI super resolution is intentionally excluded. The current installation exposes `SuperResolutionClient` and `uploadVideoForSuperResolution`, but the probe found no identifiable bundled or cached local model. It remains `local-provider-unresolved` until both a local model mapping and a local inference ABI are proven.

For exact commands, hashes, measurements, and per-capability limitations, see [the Chinese probe record](./PROBES.zh-CN.md).
