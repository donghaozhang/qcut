#!/usr/bin/env python3
"""Compare two Swing skin-model runs against Jianying UI evidence."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    parser.add_argument("--ui-rgba", type=Path, required=True)
    parser.add_argument("--ui-mask", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=854)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--mask-width", type=int, default=224)
    parser.add_argument("--mask-height", type=int, default=128)
    parser.add_argument("--frame-count", type=int, default=10)
    parser.add_argument("--discard", type=int, default=1)
    parser.add_argument("--ui-frame-count", type=int)
    parser.add_argument("--ui-start", type=int)
    parser.add_argument("--baseline-label", default="v5.0 host")
    parser.add_argument("--candidate-label", default="UI v5.1 file")
    return parser.parse_args()


def validate_args(*, args: argparse.Namespace) -> None:
    positive_values = {
        "--width": args.width,
        "--height": args.height,
        "--mask-width": args.mask_width,
        "--mask-height": args.mask_height,
        "--frame-count": args.frame_count,
    }
    for name, value in positive_values.items():
        if value <= 0:
            raise ValueError(f"{name} must be positive")
    if args.discard < 0 or args.discard >= args.frame_count:
        raise ValueError(
            "--discard must be non-negative and smaller than --frame-count"
        )
    if args.ui_frame_count is not None and args.ui_frame_count <= 0:
        raise ValueError("--ui-frame-count must be positive")


def read_exact(*, path: Path, expected_bytes: int) -> bytes:
    data = path.read_bytes()
    if len(data) != expected_bytes:
        raise ValueError(f"{path}: expected {expected_bytes} bytes, got {len(data)}")
    return data


def load_concatenated(
    *, path: Path, frame_count: int, height: int, width: int, channels: int
) -> np.ndarray:
    expected_bytes = frame_count * height * width * channels
    data = read_exact(path=path, expected_bytes=expected_bytes)
    return np.frombuffer(data, dtype=np.uint8).reshape(
        frame_count, height, width, channels
    )


def load_output_frames(
    *, run: Path, frame_count: int, height: int, width: int
) -> np.ndarray:
    frame_bytes = height * width * 4
    frames = []
    for frame_index in range(frame_count):
        path = run / "output" / f"frame-{frame_index:04d}.rgba"
        data = read_exact(path=path, expected_bytes=frame_bytes)
        frames.append(np.frombuffer(data, dtype=np.uint8).reshape(height, width, 4))
    return np.stack(frames)


def load_masks(
    *, run: Path, frame_indices: np.ndarray, height: int, width: int
) -> np.ndarray:
    mask_bytes = height * width
    masks = []
    for frame_index in frame_indices:
        sequence = int(frame_index) + 1
        path = run / "masks" / f"mask-{sequence:06d}.bin"
        data = read_exact(path=path, expected_bytes=mask_bytes)
        masks.append(np.frombuffer(data, dtype=np.uint8).reshape(height, width))
    return np.stack(masks)


def half_pixel_resize(
    *, images: np.ndarray, output_height: int, output_width: int
) -> np.ndarray:
    input_height, input_width = images.shape[-2:]
    output_x = (np.arange(output_width, dtype=np.float32) + 0.5) * (
        input_width / output_width
    ) - 0.5
    output_y = (np.arange(output_height, dtype=np.float32) + 0.5) * (
        input_height / output_height
    ) - 0.5

    x0_unclamped = np.floor(output_x).astype(np.int32)
    y0_unclamped = np.floor(output_y).astype(np.int32)
    x_weight = output_x - x0_unclamped
    y_weight = output_y - y0_unclamped
    x0 = np.clip(x0_unclamped, 0, input_width - 1)
    y0 = np.clip(y0_unclamped, 0, input_height - 1)
    x1 = np.clip(x0_unclamped + 1, 0, input_width - 1)
    y1 = np.clip(y0_unclamped + 1, 0, input_height - 1)

    source = images.astype(np.float32)
    top = source[:, y0[:, None], x0[None, :]] * (1.0 - x_weight)[None, None, :]
    top += source[:, y0[:, None], x1[None, :]] * x_weight[None, None, :]
    bottom = source[:, y1[:, None], x0[None, :]] * (
        1.0 - x_weight
    )[None, None, :]
    bottom += source[:, y1[:, None], x1[None, :]] * x_weight[None, None, :]
    return top * (1.0 - y_weight)[None, :, None] + bottom * y_weight[
        None, :, None
    ]


def correlation(*, actual: np.ndarray, expected: np.ndarray) -> float:
    actual_flat = actual.astype(np.float64).ravel()
    expected_flat = expected.astype(np.float64).ravel()
    if actual_flat.std() == 0 or expected_flat.std() == 0:
        return 0.0
    return float(np.corrcoef(actual_flat, expected_flat)[0, 1])


def scalar_metrics(*, actual: np.ndarray, expected: np.ndarray) -> dict[str, float]:
    difference = actual.astype(np.float64) - expected.astype(np.float64)
    absolute = np.abs(difference)
    mse = float(np.mean(difference * difference))
    return {
        "mae": float(np.mean(absolute)),
        "rmse": math.sqrt(mse),
        "psnr_db": 100.0 if mse == 0 else 20.0 * math.log10(255.0 / math.sqrt(mse)),
        "max_abs": float(np.max(absolute)),
        "correlation": correlation(actual=actual, expected=expected),
    }


def mask_metrics(*, actual: np.ndarray, expected: np.ndarray) -> dict[str, float]:
    metrics = scalar_metrics(actual=actual, expected=expected)
    actual_binary = actual >= 128
    expected_binary = expected >= 128
    intersection = int(np.count_nonzero(actual_binary & expected_binary))
    union = int(np.count_nonzero(actual_binary | expected_binary))
    metrics["iou_at_128"] = 1.0 if union == 0 else intersection / union
    metrics["actual_band_fraction"] = float(
        np.mean((actual > 51) & (actual < 204))
    )
    metrics["expected_band_fraction"] = float(
        np.mean((expected > 51) & (expected < 204))
    )
    return metrics


def rgb_metrics(*, actual: np.ndarray, expected: np.ndarray) -> dict[str, object]:
    actual_rgb = actual[..., :3]
    expected_rgb = expected[..., :3]
    return {
        "all_rgb": scalar_metrics(actual=actual_rgb, expected=expected_rgb),
        "red": scalar_metrics(actual=actual_rgb[..., 0], expected=expected_rgb[..., 0]),
        "green": scalar_metrics(actual=actual_rgb[..., 1], expected=expected_rgb[..., 1]),
        "blue": scalar_metrics(actual=actual_rgb[..., 2], expected=expected_rgb[..., 2]),
    }


def masked_rgb_metrics(
    *, actual: np.ndarray, expected: np.ndarray, ui_mask: np.ndarray
) -> dict[str, dict[str, float]]:
    regions = {
        "interior": ui_mask >= 192,
        "boundary": (ui_mask > 32) & (ui_mask < 224),
        "background": ui_mask <= 32,
    }
    metrics = {}
    for name, region in regions.items():
        region_rgb = np.repeat(region[..., None], 3, axis=-1)
        metrics[name] = scalar_metrics(
            actual=actual[..., :3][region_rgb],
            expected=expected[..., :3][region_rgb],
        )
        metrics[name]["pixel_fraction"] = float(np.mean(region))
    return metrics


def image_from_rgba(*, frame: np.ndarray) -> Image.Image:
    return Image.fromarray(frame.astype(np.uint8), mode="RGBA").convert("RGB")


def image_from_gray(*, frame: np.ndarray) -> Image.Image:
    clipped = np.clip(np.rint(frame), 0, 255).astype(np.uint8)
    return Image.fromarray(clipped, mode="L").convert("RGB")


def labeled_panel(*, items: list[tuple[str, Image.Image]], path: Path) -> None:
    label_height = 30
    width = sum(image.width for _, image in items)
    height = label_height + max(image.height for _, image in items)
    panel = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(panel)
    offset = 0
    for label, image in items:
        panel.paste(image, (offset, label_height))
        draw.text((offset + 8, 8), label, fill="black")
        offset += image.width
    panel.save(path)


def create_evidence_images(
    *,
    output: Path,
    ui_rgba: np.ndarray,
    baseline_rgba: np.ndarray,
    candidate_rgba: np.ndarray,
    ui_mask: np.ndarray,
    baseline_mask: np.ndarray,
    candidate_mask: np.ndarray,
    ui_frame_offset: int,
    baseline_label: str,
    candidate_label: str,
) -> None:
    index = 0
    difference_scale = 8.0
    baseline_difference = np.abs(
        baseline_rgba[index, ..., :3].astype(np.float32)
        - ui_rgba[index, ..., :3].astype(np.float32)
    ) * difference_scale
    candidate_difference = np.abs(
        candidate_rgba[index, ..., :3].astype(np.float32)
        - ui_rgba[index, ..., :3].astype(np.float32)
    ) * difference_scale

    labeled_panel(
        items=[
            (
                f"UI target frame {ui_frame_offset + 1}",
                image_from_rgba(frame=ui_rgba[index]),
            ),
            (baseline_label, image_from_rgba(frame=baseline_rgba[index])),
            (candidate_label, image_from_rgba(frame=candidate_rgba[index])),
            (
                f"{baseline_label} abs diff x8",
                Image.fromarray(np.clip(baseline_difference, 0, 255).astype(np.uint8)),
            ),
            (
                f"{candidate_label} abs diff x8",
                Image.fromarray(np.clip(candidate_difference, 0, 255).astype(np.uint8)),
            ),
        ],
        path=output / "rgba-comparison.png",
    )

    baseline_mask_difference = np.abs(baseline_mask[index] - ui_mask[index]) * 4.0
    candidate_mask_difference = np.abs(candidate_mask[index] - ui_mask[index]) * 4.0
    labeled_panel(
        items=[
            (
                f"UI mask frame {ui_frame_offset + 1}",
                image_from_gray(frame=ui_mask[index]),
            ),
            (f"{baseline_label} mask", image_from_gray(frame=baseline_mask[index])),
            (f"{candidate_label} mask", image_from_gray(frame=candidate_mask[index])),
            (
                f"{baseline_label} abs diff x4",
                image_from_gray(frame=baseline_mask_difference),
            ),
            (
                f"{candidate_label} abs diff x4",
                image_from_gray(frame=candidate_mask_difference),
            ),
        ],
        path=output / "mask-comparison.png",
    )


def per_frame_metrics(
    *,
    frame_indices: np.ndarray,
    ui_indices: np.ndarray,
    baseline_rgba: np.ndarray,
    candidate_rgba: np.ndarray,
    ui_rgba: np.ndarray,
    baseline_mask: np.ndarray,
    candidate_mask: np.ndarray,
    ui_mask: np.ndarray,
) -> list[dict[str, object]]:
    results = []
    for local_index, output_index in enumerate(frame_indices):
        baseline_rgb = scalar_metrics(
            actual=baseline_rgba[local_index, ..., :3],
            expected=ui_rgba[local_index, ..., :3],
        )
        candidate_rgb = scalar_metrics(
            actual=candidate_rgba[local_index, ..., :3],
            expected=ui_rgba[local_index, ..., :3],
        )
        baseline_ui_mask = mask_metrics(
            actual=baseline_mask[local_index], expected=ui_mask[local_index]
        )
        candidate_ui_mask = mask_metrics(
            actual=candidate_mask[local_index], expected=ui_mask[local_index]
        )
        results.append(
            {
                "output_index": int(output_index),
                "ui_index": int(ui_indices[local_index]),
                "baseline_vs_ui_rgb": baseline_rgb,
                "candidate_vs_ui_rgb": candidate_rgb,
                "rgb_psnr_delta_db": candidate_rgb["psnr_db"]
                - baseline_rgb["psnr_db"],
                "baseline_vs_ui_mask": baseline_ui_mask,
                "candidate_vs_ui_mask": candidate_ui_mask,
                "ui_mask_mae_delta": candidate_ui_mask["mae"]
                - baseline_ui_mask["mae"],
            }
        )
    return results


def main() -> None:
    args = parse_args()
    validate_args(args=args)
    ui_frame_count = (
        args.frame_count if args.ui_frame_count is None else args.ui_frame_count
    )
    ui_start = args.discard if args.ui_start is None else args.ui_start
    measured_frame_count = args.frame_count - args.discard
    if ui_start < 0 or ui_start + measured_frame_count > ui_frame_count:
        raise ValueError("UI frame range does not cover the measured run frames")
    args.output.mkdir(parents=True, exist_ok=True)

    frame_indices = np.arange(args.discard, args.frame_count)
    ui_indices = np.arange(ui_start, ui_start + measured_frame_count)
    baseline_rgba = load_output_frames(
        run=args.baseline_run,
        frame_count=args.frame_count,
        height=args.height,
        width=args.width,
    )[frame_indices]
    candidate_rgba = load_output_frames(
        run=args.candidate_run,
        frame_count=args.frame_count,
        height=args.height,
        width=args.width,
    )[frame_indices]
    ui_rgba = load_concatenated(
        path=args.ui_rgba,
        frame_count=ui_frame_count,
        height=args.height,
        width=args.width,
        channels=4,
    )[ui_indices]
    ui_mask = load_concatenated(
        path=args.ui_mask,
        frame_count=ui_frame_count,
        height=args.height,
        width=args.width,
        channels=1,
    )[..., 0][ui_indices].astype(np.float32)

    baseline_native_mask = load_masks(
        run=args.baseline_run,
        frame_indices=frame_indices,
        height=args.mask_height,
        width=args.mask_width,
    )
    candidate_native_mask = load_masks(
        run=args.candidate_run,
        frame_indices=frame_indices,
        height=args.mask_height,
        width=args.mask_width,
    )

    baseline_mask_normal = half_pixel_resize(
        images=baseline_native_mask,
        output_height=args.height,
        output_width=args.width,
    )
    candidate_mask_normal = half_pixel_resize(
        images=candidate_native_mask,
        output_height=args.height,
        output_width=args.width,
    )
    baseline_mask_flipped = half_pixel_resize(
        images=np.flip(baseline_native_mask, axis=1),
        output_height=args.height,
        output_width=args.width,
    )
    candidate_mask_flipped = half_pixel_resize(
        images=np.flip(candidate_native_mask, axis=1),
        output_height=args.height,
        output_width=args.width,
    )

    orientation_metrics = {
        "normal": {
            "baseline": mask_metrics(actual=baseline_mask_normal, expected=ui_mask),
            "candidate": mask_metrics(actual=candidate_mask_normal, expected=ui_mask),
        },
        "vertical_flip": {
            "baseline": mask_metrics(actual=baseline_mask_flipped, expected=ui_mask),
            "candidate": mask_metrics(actual=candidate_mask_flipped, expected=ui_mask),
        },
    }
    orientation = min(
        orientation_metrics,
        key=lambda name: orientation_metrics[name]["baseline"]["mae"],
    )
    if orientation == "vertical_flip":
        baseline_mask = baseline_mask_flipped
        candidate_mask = candidate_mask_flipped
    else:
        baseline_mask = baseline_mask_normal
        candidate_mask = candidate_mask_normal

    baseline_ui_rgb = rgb_metrics(actual=baseline_rgba, expected=ui_rgba)
    candidate_ui_rgb = rgb_metrics(actual=candidate_rgba, expected=ui_rgba)
    metrics = {
        "fixture": {
            "width": args.width,
            "height": args.height,
            "frame_count": args.frame_count,
            "discarded_output_frames": args.discard,
            "measured_output_indices": frame_indices.tolist(),
            "ui_frame_count": ui_frame_count,
            "measured_ui_indices": ui_indices.tolist(),
            "mask_sequence_rule": "output frame N uses capture sequence N+1",
        },
        "native_mask_candidate_vs_baseline": mask_metrics(
            actual=candidate_native_mask,
            expected=baseline_native_mask,
        ),
        "ui_mask_orientation_comparison": orientation_metrics,
        "selected_ui_mask_orientation": orientation,
        "baseline_vs_ui_rgb": baseline_ui_rgb,
        "candidate_vs_ui_rgb": candidate_ui_rgb,
        "candidate_vs_baseline_rgb": rgb_metrics(
            actual=candidate_rgba,
            expected=baseline_rgba,
        ),
        "baseline_vs_ui_regions": masked_rgb_metrics(
            actual=baseline_rgba,
            expected=ui_rgba,
            ui_mask=ui_mask,
        ),
        "candidate_vs_ui_regions": masked_rgb_metrics(
            actual=candidate_rgba,
            expected=ui_rgba,
            ui_mask=ui_mask,
        ),
        "per_frame": per_frame_metrics(
            frame_indices=frame_indices,
            ui_indices=ui_indices,
            baseline_rgba=baseline_rgba,
            candidate_rgba=candidate_rgba,
            ui_rgba=ui_rgba,
            baseline_mask=baseline_mask,
            candidate_mask=candidate_mask,
            ui_mask=ui_mask,
        ),
        "delta": {
            "rgb_rmse": candidate_ui_rgb["all_rgb"]["rmse"]
            - baseline_ui_rgb["all_rgb"]["rmse"],
            "rgb_psnr_db": candidate_ui_rgb["all_rgb"]["psnr_db"]
            - baseline_ui_rgb["all_rgb"]["psnr_db"],
            "ui_mask_mae": orientation_metrics[orientation]["candidate"]["mae"]
            - orientation_metrics[orientation]["baseline"]["mae"],
            "ui_mask_iou_at_128": orientation_metrics[orientation]["candidate"][
                "iou_at_128"
            ]
            - orientation_metrics[orientation]["baseline"]["iou_at_128"],
        },
    }

    create_evidence_images(
        output=args.output,
        ui_rgba=ui_rgba,
        baseline_rgba=baseline_rgba,
        candidate_rgba=candidate_rgba,
        ui_mask=ui_mask,
        baseline_mask=baseline_mask,
        candidate_mask=candidate_mask,
        ui_frame_offset=ui_start,
        baseline_label=args.baseline_label,
        candidate_label=args.candidate_label,
    )
    metrics_path = args.output / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
