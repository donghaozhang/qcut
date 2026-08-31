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
import numpy as np

from video_probe_common import (
    VideoInfo,
    branch_frame_indices,
    build_descriptor,
    frame_pts_us,
    normalized_quad_fields,
    open_video,
    parse_number_list,
    read_frame,
    resolve_pixel_quad,
    resolve_tracking_range,
    validate_quad,
    write_bundle,
    zero_quad_fields,
)


@dataclass(frozen=True)
class PlanarProbeConfig:
    video_path: Path
    output_directory: Path
    pixel_quad: Sequence[float] | None
    normalized_quad: Sequence[float] | None
    anchor_frame: int
    start_frame: int | None
    end_frame: int | None
    direction: str
    max_corners: int
    quality_level: float
    minimum_distance: float
    block_size: int
    minimum_inliers: int
    minimum_inlier_ratio: float
    ransac_threshold: float
    forward_backward_error: float
    overwrite: bool


def grayscale(*, frame: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def detect_anchor_features(
    *, gray: np.ndarray, anchor_quad: np.ndarray, config: PlanarProbeConfig
) -> np.ndarray:
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(mask, [np.round(anchor_quad).astype(np.int32)], 255)
    points = cv2.goodFeaturesToTrack(
        gray,
        maxCorners=config.max_corners,
        qualityLevel=config.quality_level,
        minDistance=config.minimum_distance,
        mask=mask,
        blockSize=config.block_size,
        useHarrisDetector=False,
    )
    if points is None or len(points) < config.minimum_inliers:
        detected = 0 if points is None else len(points)
        raise ValueError(
            f"Anchor plane exposes {detected} usable features; need at least {config.minimum_inliers}"
        )
    return points.astype(np.float32)


def build_planar_sample(
    *,
    frame_index: int,
    info: VideoInfo,
    quad: np.ndarray | None,
    validity: str,
    tracked_points: int,
    inlier_count: int,
    inlier_ratio: float,
    reprojection_error: float | None,
) -> dict[str, int | float | str | None]:
    fields = (
        normalized_quad_fields(quad=quad, info=info)
        if quad is not None
        else zero_quad_fields()
    )
    return {
        **fields,
        "pts": frame_pts_us(frame_index=frame_index, fps=info.fps),
        "frame_index": frame_index,
        "status": validity,
        "validity": validity,
        "tracked_points": tracked_points,
        "inlier_count": inlier_count,
        "inlier_ratio": float(inlier_ratio),
        "reprojection_error": (
            float(reprojection_error) if reprojection_error is not None else None
        ),
    }


def lost_planar_sample(
    *, frame_index: int, info: VideoInfo, tracked_points: int = 0
) -> dict[str, int | float | str | None]:
    return build_planar_sample(
        frame_index=frame_index,
        info=info,
        quad=None,
        validity="lost",
        tracked_points=tracked_points,
        inlier_count=0,
        inlier_ratio=0.0,
        reprojection_error=None,
    )


def calculate_reprojection_error(
    *,
    homography: np.ndarray,
    reference_points: np.ndarray,
    current_points: np.ndarray,
) -> float:
    projected = cv2.perspectiveTransform(reference_points, homography)
    errors = np.linalg.norm(
        projected.reshape(-1, 2) - current_points.reshape(-1, 2), axis=1
    )
    return float(np.median(errors))


def track_planar_branch(
    *,
    capture: cv2.VideoCapture,
    info: VideoInfo,
    anchor_frame: int,
    anchor_quad: np.ndarray,
    frame_indices: Sequence[int],
    config: PlanarProbeConfig,
) -> list[dict[str, int | float | str | None]]:
    if not frame_indices:
        return []

    anchor_gray = grayscale(frame=read_frame(capture, anchor_frame))
    anchor_points = detect_anchor_features(
        gray=anchor_gray,
        anchor_quad=anchor_quad,
        config=config,
    )
    reference_points = anchor_points.copy()
    previous_points = anchor_points.copy()
    previous_gray = anchor_gray
    samples = []
    empty_points = np.empty((0, 1, 2), dtype=np.float32)

    lk_parameters = {
        "winSize": (21, 21),
        "maxLevel": 3,
        "criteria": (
            cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
            30,
            0.01,
        ),
    }

    for frame_index in frame_indices:
        current_gray = grayscale(frame=read_frame(capture, frame_index))
        if len(previous_points) < 4:
            samples.append(lost_planar_sample(frame_index=frame_index, info=info))
            previous_gray = current_gray
            continue

        current_points, forward_status, _ = cv2.calcOpticalFlowPyrLK(
            previous_gray,
            current_gray,
            previous_points,
            None,
            **lk_parameters,
        )
        if current_points is None or forward_status is None:
            samples.append(lost_planar_sample(frame_index=frame_index, info=info))
            previous_gray = current_gray
            previous_points = empty_points
            reference_points = empty_points
            continue

        backward_points, backward_status, _ = cv2.calcOpticalFlowPyrLK(
            current_gray,
            previous_gray,
            current_points,
            None,
            **lk_parameters,
        )
        if backward_points is None or backward_status is None:
            samples.append(lost_planar_sample(frame_index=frame_index, info=info))
            previous_gray = current_gray
            previous_points = empty_points
            reference_points = empty_points
            continue

        forward_valid = forward_status.reshape(-1).astype(bool)
        backward_valid = backward_status.reshape(-1).astype(bool)
        round_trip_error = np.linalg.norm(
            backward_points.reshape(-1, 2) - previous_points.reshape(-1, 2), axis=1
        )
        valid_flow = (
            forward_valid
            & backward_valid
            & np.isfinite(round_trip_error)
            & (round_trip_error <= config.forward_backward_error)
        )
        active_reference = reference_points[valid_flow]
        active_current = current_points[valid_flow]
        tracked_points = len(active_current)
        if tracked_points < 4:
            samples.append(
                lost_planar_sample(
                    frame_index=frame_index,
                    info=info,
                    tracked_points=tracked_points,
                )
            )
            previous_gray = current_gray
            previous_points = active_current
            reference_points = active_reference
            continue

        homography, inlier_mask = cv2.findHomography(
            active_reference,
            active_current,
            cv2.RANSAC,
            config.ransac_threshold,
        )
        if (
            homography is None
            or inlier_mask is None
            or not np.all(np.isfinite(homography))
        ):
            samples.append(
                lost_planar_sample(
                    frame_index=frame_index,
                    info=info,
                    tracked_points=tracked_points,
                )
            )
            previous_gray = current_gray
            previous_points = active_current
            reference_points = active_reference
            continue

        inliers = inlier_mask.reshape(-1).astype(bool)
        inlier_count = int(np.count_nonzero(inliers))
        inlier_ratio = inlier_count / tracked_points
        projected_quad = cv2.perspectiveTransform(
            anchor_quad.reshape(-1, 1, 2), homography
        ).reshape(4, 2)
        quad_valid, _ = validate_quad(projected_quad, minimum_area=4.0)
        enough_inliers = (
            inlier_count >= config.minimum_inliers
            and inlier_ratio >= config.minimum_inlier_ratio
        )

        if quad_valid and enough_inliers:
            reprojection_error = calculate_reprojection_error(
                homography=homography,
                reference_points=active_reference[inliers],
                current_points=active_current[inliers],
            )
            samples.append(
                build_planar_sample(
                    frame_index=frame_index,
                    info=info,
                    quad=projected_quad,
                    validity="valid",
                    tracked_points=tracked_points,
                    inlier_count=inlier_count,
                    inlier_ratio=inlier_ratio,
                    reprojection_error=reprojection_error,
                )
            )
            reference_points = active_reference[inliers]
            previous_points = active_current[inliers]
        else:
            samples.append(
                lost_planar_sample(
                    frame_index=frame_index,
                    info=info,
                    tracked_points=tracked_points,
                )
            )
            reference_points = active_reference
            previous_points = active_current
        previous_gray = current_gray
    return samples


def solve_planar_video(
    *, config: PlanarProbeConfig
) -> tuple[dict[str, object], dict[str, object]]:
    capture, info = open_video(config.video_path)
    try:
        tracking_range = resolve_tracking_range(
            info=info,
            anchor_frame=config.anchor_frame,
            start_frame=config.start_frame,
            end_frame=config.end_frame,
            direction=config.direction,
        )
        anchor_quad = resolve_pixel_quad(
            info=info,
            pixel_quad=config.pixel_quad,
            normalized_quad=config.normalized_quad,
        )
        anchor_gray = grayscale(frame=read_frame(capture, tracking_range.anchor_frame))
        anchor_features = detect_anchor_features(
            gray=anchor_gray,
            anchor_quad=anchor_quad,
            config=config,
        )
        forward_indices, backward_indices = branch_frame_indices(tracking_range)
        branch_arguments = {
            "capture": capture,
            "info": info,
            "anchor_frame": tracking_range.anchor_frame,
            "anchor_quad": anchor_quad,
            "config": config,
        }
        samples = [
            build_planar_sample(
                frame_index=tracking_range.anchor_frame,
                info=info,
                quad=anchor_quad,
                validity="valid",
                tracked_points=len(anchor_features),
                inlier_count=len(anchor_features),
                inlier_ratio=1.0,
                reprojection_error=0.0,
            ),
            *track_planar_branch(frame_indices=forward_indices, **branch_arguments),
            *track_planar_branch(frame_indices=backward_indices, **branch_arguments),
        ]
        samples.sort(key=lambda sample: int(sample["frame_index"]))
        lost_frames = sum(sample["validity"] == "lost" for sample in samples)
        descriptor = build_descriptor(
            kind="planar",
            algorithm="opencv-lk-ransac-homography",
            info=info,
            tracking_range=tracking_range,
            settings={
                "quadPixels": anchor_quad.astype(float).reshape(-1).tolist(),
                "maxCorners": config.max_corners,
                "qualityLevel": config.quality_level,
                "minimumDistance": config.minimum_distance,
                "blockSize": config.block_size,
                "minimumInliers": config.minimum_inliers,
                "minimumInlierRatio": config.minimum_inlier_ratio,
                "ransacThreshold": config.ransac_threshold,
                "forwardBackwardError": config.forward_backward_error,
                "lostFrames": lost_frames,
            },
        )
        return descriptor, {"baseline": None, "data": samples}
    finally:
        capture.release()


def positive_int(raw_value: str) -> int:
    value = int(raw_value)
    if value <= 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return value


def positive_float(raw_value: str) -> float:
    value = float(raw_value)
    if not math.isfinite(value) or value <= 0:
        raise argparse.ArgumentTypeError("value must be finite and positive")
    return value


def ratio_float(raw_value: str) -> float:
    value = float(raw_value)
    if not math.isfinite(value) or not 0 < value <= 1:
        raise argparse.ArgumentTypeError("value must be in (0, 1]")
    return value


def parse_arguments(*, argv: Sequence[str]) -> tuple[PlanarProbeConfig, bool]:
    parser = argparse.ArgumentParser(
        description="Run standalone planar LK + RANSAC homography tracking."
    )
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--quad", help="Pixel x1,y1,x2,y2,x3,y3,x4,y4")
    target.add_argument("--quad-normalized", help="Normalized x1,y1,x2,y2,x3,y3,x4,y4")
    parser.add_argument("--anchor-frame", type=int, default=0)
    parser.add_argument("--start-frame", type=int)
    parser.add_argument("--end-frame", type=int)
    parser.add_argument(
        "--direction", choices=("forward", "backward", "both"), default="forward"
    )
    parser.add_argument("--max-corners", type=positive_int, default=250)
    parser.add_argument("--quality-level", type=ratio_float, default=0.01)
    parser.add_argument("--minimum-distance", type=positive_float, default=7.0)
    parser.add_argument("--block-size", type=positive_int, default=7)
    parser.add_argument("--minimum-inliers", type=positive_int, default=8)
    parser.add_argument("--minimum-inlier-ratio", type=ratio_float, default=0.4)
    parser.add_argument("--ransac-threshold", type=positive_float, default=3.0)
    parser.add_argument("--forward-backward-error", type=positive_float, default=1.5)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--fail-on-lost", action="store_true")
    arguments = parser.parse_args(argv)

    pixel_quad = (
        parse_number_list(arguments.quad, 8, "--quad") if arguments.quad else None
    )
    normalized_quad = (
        parse_number_list(arguments.quad_normalized, 8, "--quad-normalized")
        if arguments.quad_normalized
        else None
    )
    return (
        PlanarProbeConfig(
            video_path=arguments.video,
            output_directory=arguments.output,
            pixel_quad=pixel_quad,
            normalized_quad=normalized_quad,
            anchor_frame=arguments.anchor_frame,
            start_frame=arguments.start_frame,
            end_frame=arguments.end_frame,
            direction=arguments.direction,
            max_corners=arguments.max_corners,
            quality_level=arguments.quality_level,
            minimum_distance=arguments.minimum_distance,
            block_size=arguments.block_size,
            minimum_inliers=arguments.minimum_inliers,
            minimum_inlier_ratio=arguments.minimum_inlier_ratio,
            ransac_threshold=arguments.ransac_threshold,
            forward_backward_error=arguments.forward_backward_error,
            overwrite=arguments.overwrite,
        ),
        arguments.fail_on_lost,
    )


def main(*, argv: Sequence[str]) -> int:
    try:
        config, fail_on_lost = parse_arguments(argv=argv)
        descriptor, data = solve_planar_video(config=config)
        write_bundle(
            output_directory=config.output_directory,
            descriptor=descriptor,
            data=data,
            cache=None,
            overwrite=config.overwrite,
        )
        samples = data["data"]
        assert isinstance(samples, list)
        lost_frames = sum(sample["validity"] == "lost" for sample in samples)
        summary = {
            "output": str(config.output_directory.expanduser().resolve()),
            "kind": "planar",
            "algorithm": descriptor["algorithm"],
            "samples": len(samples),
            "lostFrames": lost_frames,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 2 if fail_on_lost and lost_frames > 0 else 0
    except (cv2.error, OSError, RuntimeError, TypeError, ValueError) as error:
        print(f"probe_planar_video: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(argv=sys.argv[1:]))
