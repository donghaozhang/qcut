from __future__ import annotations

import json
import math
import shutil
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class VideoInfo:
    path: Path
    width: int
    height: int
    fps: float
    frame_count: int


@dataclass(frozen=True)
class TrackingRange:
    anchor_frame: int
    start_frame: int
    end_frame: int
    direction: str


def open_video(video_path: Path) -> tuple[cv2.VideoCapture, VideoInfo]:
    resolved_path = video_path.expanduser().resolve()
    capture = cv2.VideoCapture(str(resolved_path))
    if not capture.isOpened():
        raise ValueError(f"Cannot open video: {resolved_path}")

    width = round(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    frame_count = round(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if width <= 0 or height <= 0:
        capture.release()
        raise ValueError(f"Video reports invalid dimensions: {width}x{height}")
    if not math.isfinite(fps) or fps <= 0:
        capture.release()
        raise ValueError(f"Video reports invalid FPS: {fps}")
    if frame_count <= 0:
        capture.release()
        raise ValueError("Video does not expose a positive frame count")

    return capture, VideoInfo(
        path=resolved_path,
        width=width,
        height=height,
        fps=fps,
        frame_count=frame_count,
    )


def read_frame(capture: cv2.VideoCapture, frame_index: int) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    success, frame = capture.read()
    if not success or frame is None:
        raise ValueError(f"Cannot decode frame {frame_index}")
    return frame


def parse_number_list(
    raw_value: str, expected_count: int, option_name: str
) -> list[float]:
    parts = [part.strip() for part in raw_value.split(",")]
    if len(parts) != expected_count:
        raise ValueError(
            f"{option_name} expects {expected_count} comma-separated numbers, got {len(parts)}"
        )

    try:
        values = [float(part) for part in parts]
    except ValueError as error:
        raise ValueError(f"{option_name} contains a non-numeric value") from error
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"{option_name} contains NaN or Infinity")
    return values


def resolve_tracking_range(
    *,
    info: VideoInfo,
    anchor_frame: int,
    start_frame: int | None,
    end_frame: int | None,
    direction: str,
) -> TrackingRange:
    resolved_start = 0 if start_frame is None else start_frame
    resolved_end = info.frame_count - 1 if end_frame is None else end_frame
    if direction not in {"forward", "backward", "both"}:
        raise ValueError(f"Unsupported tracking direction: {direction}")
    if not 0 <= resolved_start <= resolved_end < info.frame_count:
        raise ValueError(
            f"Frame range {resolved_start}..{resolved_end} is outside 0..{info.frame_count - 1}"
        )
    if not resolved_start <= anchor_frame <= resolved_end:
        raise ValueError(
            f"Anchor frame {anchor_frame} is outside {resolved_start}..{resolved_end}"
        )

    return TrackingRange(
        anchor_frame=anchor_frame,
        start_frame=resolved_start,
        end_frame=resolved_end,
        direction=direction,
    )


def branch_frame_indices(tracking_range: TrackingRange) -> tuple[list[int], list[int]]:
    forward = (
        list(range(tracking_range.anchor_frame + 1, tracking_range.end_frame + 1))
        if tracking_range.direction in {"forward", "both"}
        else []
    )
    backward = (
        list(range(tracking_range.anchor_frame - 1, tracking_range.start_frame - 1, -1))
        if tracking_range.direction in {"backward", "both"}
        else []
    )
    return forward, backward


def covered_frame_bounds(*, tracking_range: TrackingRange) -> tuple[int, int]:
    if tracking_range.direction == "forward":
        return tracking_range.anchor_frame, tracking_range.end_frame
    if tracking_range.direction == "backward":
        return tracking_range.start_frame, tracking_range.anchor_frame
    return tracking_range.start_frame, tracking_range.end_frame


def frame_pts_us(*, frame_index: int, fps: float) -> int:
    return round(frame_index * 1_000_000 / fps)


def resolve_pixel_bbox(
    *,
    info: VideoInfo,
    pixel_bbox: Sequence[float] | None,
    normalized_bbox: Sequence[float] | None,
) -> tuple[float, float, float, float]:
    if (pixel_bbox is None) == (normalized_bbox is None):
        raise ValueError("Provide exactly one of --bbox or --bbox-normalized")

    if pixel_bbox is not None:
        x, y, width, height = pixel_bbox
    else:
        assert normalized_bbox is not None
        left, top, right, bottom = normalized_bbox
        x = left * info.width
        y = top * info.height
        width = (right - left) * info.width
        height = (bottom - top) * info.height

    if width <= 0 or height <= 0:
        raise ValueError("Tracking bbox must have positive width and height")
    if x < 0 or y < 0 or x + width > info.width or y + height > info.height:
        raise ValueError(
            f"Tracking bbox {(x, y, width, height)} is outside {info.width}x{info.height}"
        )
    return float(x), float(y), float(width), float(height)


def resolve_pixel_quad(
    *,
    info: VideoInfo,
    pixel_quad: Sequence[float] | None,
    normalized_quad: Sequence[float] | None,
) -> np.ndarray:
    if (pixel_quad is None) == (normalized_quad is None):
        raise ValueError("Provide exactly one of --quad or --quad-normalized")

    values = pixel_quad if pixel_quad is not None else normalized_quad
    assert values is not None
    quad = np.asarray(values, dtype=np.float32).reshape(4, 2)
    if normalized_quad is not None:
        quad = quad * np.asarray([info.width, info.height], dtype=np.float32)

    valid, reason = validate_quad(quad, minimum_area=4.0)
    if not valid:
        raise ValueError(f"Invalid tracking quad: {reason}")
    if np.any(quad[:, 0] < 0) or np.any(quad[:, 0] > info.width):
        raise ValueError("Tracking quad has x coordinates outside the video")
    if np.any(quad[:, 1] < 0) or np.any(quad[:, 1] > info.height):
        raise ValueError("Tracking quad has y coordinates outside the video")
    return quad


def signed_quad_area(quad: np.ndarray) -> float:
    x_values = quad[:, 0]
    y_values = quad[:, 1]
    return float(
        0.5
        * (
            np.dot(x_values, np.roll(y_values, -1))
            - np.dot(y_values, np.roll(x_values, -1))
        )
    )


def _orientation(left: np.ndarray, middle: np.ndarray, right: np.ndarray) -> float:
    first = middle - left
    second = right - middle
    return float(first[0] * second[1] - first[1] * second[0])


def _segments_intersect(
    first_start: np.ndarray,
    first_end: np.ndarray,
    second_start: np.ndarray,
    second_end: np.ndarray,
    *,
    epsilon: float = 1e-6,
) -> bool:
    orientations = (
        _orientation(first_start, first_end, second_start),
        _orientation(first_start, first_end, second_end),
        _orientation(second_start, second_end, first_start),
        _orientation(second_start, second_end, first_end),
    )
    return (
        orientations[0] * orientations[1] < -epsilon
        and orientations[2] * orientations[3] < -epsilon
    )


def validate_quad(quad: np.ndarray, *, minimum_area: float) -> tuple[bool, str | None]:
    if quad.shape != (4, 2):
        return False, "quad must have shape (4, 2)"
    if not np.all(np.isfinite(quad)):
        return False, "quad contains NaN or Infinity"
    if abs(signed_quad_area(quad)) < minimum_area:
        return False, "quad area is degenerate"
    if _segments_intersect(quad[0], quad[1], quad[2], quad[3]) or _segments_intersect(
        quad[1], quad[2], quad[3], quad[0]
    ):
        return False, "quad is self-intersecting"
    edge_lengths = np.linalg.norm(quad - np.roll(quad, -1, axis=0), axis=1)
    if np.any(edge_lengths <= 1e-6):
        return False, "quad has a collapsed edge"
    return True, None


def normalized_rect_fields(
    *, bbox: Sequence[float], info: VideoInfo
) -> dict[str, float]:
    x, y, width, height = bbox
    return {
        "left": float(x / info.width),
        "top": float(y / info.height),
        "right": float((x + width) / info.width),
        "bottom": float((y + height) / info.height),
    }


def normalized_quad_fields(*, quad: np.ndarray, info: VideoInfo) -> dict[str, float]:
    normalized = quad / np.asarray([info.width, info.height], dtype=np.float32)
    fields: dict[str, float] = {}
    for point_index, point in enumerate(normalized, start=1):
        fields[f"p_x{point_index}"] = float(point[0])
        fields[f"p_y{point_index}"] = float(point[1])
    return fields


def zero_quad_fields() -> dict[str, float]:
    return {
        field: 0.0
        for point_index in range(1, 5)
        for field in (f"p_x{point_index}", f"p_y{point_index}")
    }


def describe_video(info: VideoInfo) -> dict[str, int | float | str]:
    return {
        "fileName": info.path.name,
        "width": info.width,
        "height": info.height,
        "fps": info.fps,
        "frameCount": info.frame_count,
    }


def build_descriptor(
    *,
    kind: str,
    algorithm: str,
    info: VideoInfo,
    tracking_range: TrackingRange,
    settings: dict[str, int | float | str | bool],
) -> dict[str, object]:
    start_frame, end_frame = covered_frame_bounds(tracking_range=tracking_range)
    return {
        "schema": "qcut.standalone-tracking-probe/1",
        "kind": kind,
        "algorithm": algorithm,
        "video": describe_video(info),
        "direction": tracking_range.direction,
        "anchorFrame": tracking_range.anchor_frame,
        "startFrame": start_frame,
        "endFrame": end_frame,
        "startTime": frame_pts_us(frame_index=start_frame, fps=info.fps),
        "endTime": frame_pts_us(frame_index=end_frame, fps=info.fps),
        "settings": settings,
    }


def write_bundle(
    *,
    output_directory: Path,
    descriptor: dict[str, object],
    data: dict[str, object],
    cache: dict[str, object] | None,
    overwrite: bool,
) -> None:
    expanded_output = output_directory.expanduser()
    if ".." in expanded_output.parts:
        raise ValueError(
            f"Output cannot contain parent traversal: {expanded_output}"
        )
    absolute_output = expanded_output.absolute()
    resolved_output = absolute_output.parent.resolve() / absolute_output.name
    if resolved_output == resolved_output.parent:
        raise ValueError("Output cannot be a filesystem root")
    if resolved_output.is_symlink():
        raise ValueError(f"Output cannot be a symbolic link: {resolved_output}")
    if resolved_output.exists() and not overwrite:
        raise FileExistsError(
            f"Output already exists: {resolved_output}; pass --overwrite to replace it"
        )

    serialized_files = (
        ("desc.json", json.dumps(descriptor, ensure_ascii=False, indent=2) + "\n"),
        ("data.json", json.dumps(data, ensure_ascii=False, indent=2) + "\n"),
    )
    serialized_cache = (
        json.dumps(cache, ensure_ascii=False, indent=2) + "\n"
        if cache is not None
        else None
    )

    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = Path(
        tempfile.mkdtemp(
            prefix=f".{resolved_output.name}.partial-",
            dir=resolved_output.parent,
        )
    )
    try:
        for file_name, payload in serialized_files:
            (temporary_output / file_name).write_text(payload, encoding="utf-8")
        if serialized_cache is not None:
            (temporary_output / "cache.json").write_text(
                serialized_cache,
                encoding="utf-8",
            )

        if resolved_output.exists():
            if resolved_output.is_dir():
                shutil.rmtree(resolved_output)
            else:
                resolved_output.unlink()
        temporary_output.replace(resolved_output)
    finally:
        if temporary_output.exists():
            shutil.rmtree(temporary_output)
