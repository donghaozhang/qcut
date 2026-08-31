#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import cv2

from video_probe_common import (
    VideoInfo,
    branch_frame_indices,
    build_descriptor,
    frame_pts_us,
    normalized_rect_fields,
    open_video,
    parse_number_list,
    read_frame,
    resolve_pixel_bbox,
    resolve_tracking_range,
    write_bundle,
)


@dataclass(frozen=True)
class MotionProbeConfig:
    video_path: Path
    output_directory: Path
    pixel_bbox: Sequence[float] | None
    normalized_bbox: Sequence[float] | None
    anchor_frame: int
    start_frame: int | None
    end_frame: int | None
    direction: str
    tracker_name: str
    overwrite: bool


def create_tracker(*, tracker_name: str) -> cv2.Tracker:
    factories = {
        "csrt": getattr(cv2, "TrackerCSRT_create", None),
        "kcf": getattr(cv2, "TrackerKCF_create", None),
        "mosse": getattr(getattr(cv2, "legacy", None), "TrackerMOSSE_create", None),
    }
    factory = factories.get(tracker_name)
    if factory is None:
        raise ValueError(
            f"Tracker '{tracker_name}' is unavailable; install opencv-contrib-python-headless"
        )
    return factory()


def valid_bbox(*, bbox: Sequence[float]) -> bool:
    return (
        len(bbox) == 4
        and all(math.isfinite(value) for value in bbox)
        and bbox[2] > 0
        and bbox[3] > 0
    )


def build_motion_sample(
    *,
    frame_index: int,
    info: VideoInfo,
    bbox: Sequence[float] | None,
    validity: str,
) -> dict[str, int | float | str]:
    fields = (
        normalized_rect_fields(bbox=bbox, info=info)
        if bbox is not None
        else {"left": 0.0, "top": 0.0, "right": 0.0, "bottom": 0.0}
    )
    return {
        **fields,
        "angle": 0.0,
        "pts": frame_pts_us(frame_index=frame_index, fps=info.fps),
        "frame_index": frame_index,
        "status": validity,
        "validity": validity,
    }


def track_motion_branch(
    *,
    capture: cv2.VideoCapture,
    info: VideoInfo,
    anchor_frame: int,
    anchor_bbox: Sequence[float],
    frame_indices: Sequence[int],
    tracker_name: str,
) -> list[dict[str, int | float | str]]:
    if not frame_indices:
        return []

    tracker = create_tracker(tracker_name=tracker_name)
    anchor_image = read_frame(capture, anchor_frame)
    tracker_bbox = tuple(round(value) for value in anchor_bbox)
    initialized = tracker.init(anchor_image, tracker_bbox)
    if initialized is False:
        raise RuntimeError("OpenCV tracker rejected the anchor bbox")

    samples = []
    for frame_index in frame_indices:
        frame = read_frame(capture, frame_index)
        success, bbox = tracker.update(frame)
        if success and valid_bbox(bbox=bbox):
            samples.append(
                build_motion_sample(
                    frame_index=frame_index,
                    info=info,
                    bbox=bbox,
                    validity="valid",
                )
            )
            continue

        samples.append(
            build_motion_sample(
                frame_index=frame_index,
                info=info,
                bbox=None,
                validity="lost",
            )
        )
    return samples


def solve_motion_video(
    *, config: MotionProbeConfig
) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    capture, info = open_video(config.video_path)
    try:
        tracking_range = resolve_tracking_range(
            info=info,
            anchor_frame=config.anchor_frame,
            start_frame=config.start_frame,
            end_frame=config.end_frame,
            direction=config.direction,
        )
        anchor_bbox = resolve_pixel_bbox(
            info=info,
            pixel_bbox=config.pixel_bbox,
            normalized_bbox=config.normalized_bbox,
        )
        forward_indices, backward_indices = branch_frame_indices(tracking_range)
        branch_arguments = {
            "capture": capture,
            "info": info,
            "anchor_frame": tracking_range.anchor_frame,
            "anchor_bbox": anchor_bbox,
            "tracker_name": config.tracker_name,
        }
        samples = [
            build_motion_sample(
                frame_index=tracking_range.anchor_frame,
                info=info,
                bbox=anchor_bbox,
                validity="valid",
            ),
            *track_motion_branch(frame_indices=forward_indices, **branch_arguments),
            *track_motion_branch(frame_indices=backward_indices, **branch_arguments),
        ]
        samples.sort(key=lambda sample: int(sample["frame_index"]))

        valid_samples = [sample for sample in samples if sample["validity"] == "valid"]
        dense_boxes = [
            [
                float(sample["frame_index"]) / info.fps,
                [
                    float(sample["left"]) * info.width,
                    float(sample["top"]) * info.height,
                    float(sample["right"]) * info.width,
                    float(sample["bottom"]) * info.height,
                ],
            ]
            for sample in valid_samples
        ]
        descriptor = build_descriptor(
            kind="motion",
            algorithm=f"opencv-{config.tracker_name}",
            info=info,
            tracking_range=tracking_range,
            settings={
                "bboxPixels": [float(value) for value in anchor_bbox],
                "lostFrames": len(samples) - len(valid_samples),
            },
        )
        data = {"baseline": [], "data": samples}
        cache = {
            "schema": "qcut.standalone-motion-cache/1",
            "image_width": info.width,
            "image_height": info.height,
            "lockon_box": [
                anchor_bbox[0] / info.width,
                anchor_bbox[1] / info.height,
                (anchor_bbox[0] + anchor_bbox[2]) / info.width,
                (anchor_bbox[1] + anchor_bbox[3]) / info.height,
            ],
            "track_boxes": dense_boxes,
        }
        return descriptor, data, cache
    finally:
        capture.release()


def parse_arguments(*, argv: Sequence[str]) -> tuple[MotionProbeConfig, bool]:
    parser = argparse.ArgumentParser(
        description="Run standalone OpenCV single-object tracking and emit a probe bundle."
    )
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--bbox", help="Pixel x,y,width,height")
    target.add_argument("--bbox-normalized", help="Normalized left,top,right,bottom")
    parser.add_argument("--anchor-frame", type=int, default=0)
    parser.add_argument("--start-frame", type=int)
    parser.add_argument("--end-frame", type=int)
    parser.add_argument(
        "--direction", choices=("forward", "backward", "both"), default="forward"
    )
    parser.add_argument("--tracker", choices=("csrt", "kcf", "mosse"), default="csrt")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--fail-on-lost", action="store_true")
    arguments = parser.parse_args(argv)

    pixel_bbox = (
        parse_number_list(arguments.bbox, 4, "--bbox") if arguments.bbox else None
    )
    normalized_bbox = (
        parse_number_list(arguments.bbox_normalized, 4, "--bbox-normalized")
        if arguments.bbox_normalized
        else None
    )
    return (
        MotionProbeConfig(
            video_path=arguments.video,
            output_directory=arguments.output,
            pixel_bbox=pixel_bbox,
            normalized_bbox=normalized_bbox,
            anchor_frame=arguments.anchor_frame,
            start_frame=arguments.start_frame,
            end_frame=arguments.end_frame,
            direction=arguments.direction,
            tracker_name=arguments.tracker,
            overwrite=arguments.overwrite,
        ),
        arguments.fail_on_lost,
    )


def main(*, argv: Sequence[str]) -> int:
    try:
        config, fail_on_lost = parse_arguments(argv=argv)
        descriptor, data, cache = solve_motion_video(config=config)
        write_bundle(
            output_directory=config.output_directory,
            descriptor=descriptor,
            data=data,
            cache=cache,
            overwrite=config.overwrite,
        )
        samples = data["data"]
        assert isinstance(samples, list)
        lost_frames = sum(sample["validity"] == "lost" for sample in samples)
        summary = {
            "output": str(config.output_directory.expanduser().resolve()),
            "kind": "motion",
            "algorithm": descriptor["algorithm"],
            "samples": len(samples),
            "lostFrames": lost_frames,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 2 if fail_on_lost and lost_frames > 0 else 0
    except (cv2.error, OSError, RuntimeError, TypeError, ValueError) as error:
        print(f"probe_motion_video: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(argv=sys.argv[1:]))
