from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from probe_motion_video import MotionProbeConfig, solve_motion_video
from probe_planar_video import PlanarProbeConfig, solve_planar_video
from video_probe_common import (
    TrackingRange,
    VideoInfo,
    branch_frame_indices,
    covered_frame_bounds,
    validate_quad,
    write_bundle,
)


def build_test_patch(*, width: int, height: int) -> np.ndarray:
    patch = np.full((height, width, 3), 235, dtype=np.uint8)
    cell_size = 10
    for row in range(0, height, cell_size):
        for column in range(0, width, cell_size):
            if (row // cell_size + column // cell_size) % 2 == 0:
                patch[row : row + cell_size, column : column + cell_size] = (
                    30,
                    70,
                    220,
                )
    rng = np.random.default_rng(7)
    for _ in range(70):
        center = (
            int(rng.integers(3, width - 3)),
            int(rng.integers(3, height - 3)),
        )
        color = tuple(int(value) for value in rng.integers(0, 255, size=3))
        cv2.circle(patch, center, 2, color, -1, cv2.LINE_AA)
    return patch


def target_quad_for_frame(*, frame_index: int) -> np.ndarray:
    return np.asarray(
        [
            [45 + 1.1 * frame_index, 35 + 0.2 * frame_index],
            [40 + 0.8 * frame_index, 125 - 0.1 * frame_index],
            [155 + 0.55 * frame_index, 132 + 0.15 * frame_index],
            [162 + 0.75 * frame_index, 32 + 0.25 * frame_index],
        ],
        dtype=np.float32,
    )


def write_synthetic_plane_video(
    *, output_path: Path, frame_count: int, fps: float
) -> list[np.ndarray]:
    width = 240
    height = 180
    patch = build_test_patch(width=120, height=100)
    source_quad = np.asarray([[0, 0], [0, 99], [119, 99], [119, 0]], dtype=np.float32)
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"MJPG"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError("OpenCV MJPG VideoWriter is unavailable")

    quads = []
    try:
        for frame_index in range(frame_count):
            frame = np.full((height, width, 3), 24, dtype=np.uint8)
            cv2.line(frame, (0, 20), (width - 1, 20), (70, 70, 70), 1)
            cv2.line(frame, (20, 0), (20, height - 1), (70, 70, 70), 1)
            target_quad = target_quad_for_frame(frame_index=frame_index)
            homography = cv2.getPerspectiveTransform(source_quad, target_quad)
            warped_patch = cv2.warpPerspective(patch, homography, (width, height))
            patch_mask = cv2.warpPerspective(
                np.full(patch.shape[:2], 255, dtype=np.uint8),
                homography,
                (width, height),
            )
            frame[patch_mask > 0] = warped_patch[patch_mask > 0]
            writer.write(frame)
            quads.append(target_quad)
    finally:
        writer.release()
    return quads


def sample_quad_pixels(
    *, sample: dict[str, object], width: int, height: int
) -> np.ndarray:
    return np.asarray(
        [
            [
                float(sample[f"p_x{index}"]) * width,
                float(sample[f"p_y{index}"]) * height,
            ]
            for index in range(1, 5)
        ],
        dtype=np.float32,
    )


class VideoProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary_directory = tempfile.TemporaryDirectory(
            prefix="standalone-video-probes-"
        )
        cls.root = Path(cls.temporary_directory.name)
        cls.video_path = cls.root / "plane.avi"
        cls.frame_count = 24
        cls.fps = 20.0
        cls.quads = write_synthetic_plane_video(
            output_path=cls.video_path,
            frame_count=cls.frame_count,
            fps=cls.fps,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temporary_directory.cleanup()

    def test_planar_solver_tracks_known_perspective_motion(self) -> None:
        config = PlanarProbeConfig(
            video_path=self.video_path,
            output_directory=self.root / "planar-output",
            pixel_quad=self.quads[0].reshape(-1).tolist(),
            normalized_quad=None,
            anchor_frame=0,
            start_frame=0,
            end_frame=self.frame_count - 1,
            direction="forward",
            max_corners=250,
            quality_level=0.01,
            minimum_distance=4.0,
            block_size=5,
            minimum_inliers=6,
            minimum_inlier_ratio=0.4,
            ransac_threshold=3.0,
            forward_backward_error=1.5,
            overwrite=False,
        )

        descriptor, data = solve_planar_video(config=config)
        samples = data["data"]
        self.assertIsInstance(samples, list)
        assert isinstance(samples, list)
        valid_samples = [sample for sample in samples if sample["validity"] == "valid"]
        last_quad = sample_quad_pixels(
            sample=valid_samples[-1],
            width=240,
            height=180,
        )
        maximum_corner_error = float(
            np.max(np.linalg.norm(last_quad - self.quads[-1], axis=1))
        )

        self.assertEqual(descriptor["algorithm"], "opencv-lk-ransac-homography")
        self.assertEqual(len(samples), self.frame_count)
        self.assertGreaterEqual(len(valid_samples), self.frame_count - 1)
        self.assertLess(maximum_corner_error, 4.0)

    def test_motion_solver_tracks_the_same_plane_as_a_rectangle(self) -> None:
        x, y, width, height = cv2.boundingRect(np.round(self.quads[0]).astype(np.int32))
        config = MotionProbeConfig(
            video_path=self.video_path,
            output_directory=self.root / "motion-output",
            pixel_bbox=[x, y, width, height],
            normalized_bbox=None,
            anchor_frame=0,
            start_frame=0,
            end_frame=self.frame_count - 1,
            direction="forward",
            tracker_name="csrt",
            overwrite=False,
        )

        descriptor, data, cache = solve_motion_video(config=config)
        samples = data["data"]
        self.assertIsInstance(samples, list)
        assert isinstance(samples, list)
        valid_samples = [sample for sample in samples if sample["validity"] == "valid"]
        final_sample = valid_samples[-1]
        tracked_center = np.asarray(
            [
                (float(final_sample["left"]) + float(final_sample["right"])) * 120,
                (float(final_sample["top"]) + float(final_sample["bottom"])) * 90,
            ]
        )
        expected_center = np.mean(self.quads[-1], axis=0)

        self.assertEqual(descriptor["algorithm"], "opencv-csrt")
        self.assertEqual(len(samples), self.frame_count)
        self.assertGreaterEqual(len(valid_samples), self.frame_count - 1)
        self.assertEqual(len(cache["track_boxes"]), len(valid_samples))
        self.assertLess(float(np.linalg.norm(tracked_center - expected_center)), 18.0)

    def test_planar_solver_stays_lost_after_feature_exhaustion(self) -> None:
        config = PlanarProbeConfig(
            video_path=self.video_path,
            output_directory=self.root / "planar-lost-output",
            pixel_quad=self.quads[0].reshape(-1).tolist(),
            normalized_quad=None,
            anchor_frame=0,
            start_frame=0,
            end_frame=4,
            direction="forward",
            max_corners=250,
            quality_level=0.01,
            minimum_distance=4.0,
            block_size=5,
            minimum_inliers=6,
            minimum_inlier_ratio=0.4,
            ransac_threshold=3.0,
            forward_backward_error=-1.0,
            overwrite=False,
        )

        _, data = solve_planar_video(config=config)
        samples = data["data"]
        self.assertIsInstance(samples, list)
        assert isinstance(samples, list)
        self.assertEqual(samples[0]["validity"], "valid")
        self.assertTrue(all(sample["validity"] == "lost" for sample in samples[1:]))

    def test_branch_indices_are_anchored_and_non_overlapping(self) -> None:
        tracking_range = TrackingRange(
            anchor_frame=5,
            start_frame=2,
            end_frame=8,
            direction="both",
        )
        forward, backward = branch_frame_indices(tracking_range)
        self.assertEqual(forward, [6, 7, 8])
        self.assertEqual(backward, [4, 3, 2])
        self.assertNotIn(5, forward + backward)

    def test_descriptor_bounds_match_directional_sample_coverage(self) -> None:
        tracking_range = TrackingRange(
            anchor_frame=5,
            start_frame=2,
            end_frame=8,
            direction="forward",
        )
        self.assertEqual(
            covered_frame_bounds(tracking_range=tracking_range),
            (5, 8),
        )

    def test_quad_validation_rejects_a_bow_tie(self) -> None:
        bow_tie = np.asarray(
            [[20, 20], [100, 100], [20, 100], [100, 20]], dtype=np.float32
        )
        valid, reason = validate_quad(bow_tie, minimum_area=4.0)
        self.assertFalse(valid)
        self.assertIn(reason, {"quad area is degenerate", "quad is self-intersecting"})

    def test_bundle_writer_refuses_implicit_overwrite(self) -> None:
        output = self.root / "write-once"
        info = VideoInfo(
            path=self.video_path,
            width=240,
            height=180,
            fps=self.fps,
            frame_count=self.frame_count,
        )
        descriptor = {"kind": "planar", "video": info.path.name}
        data = {"baseline": None, "data": []}
        write_bundle(
            output_directory=output,
            descriptor=descriptor,
            data=data,
            cache=None,
            overwrite=False,
        )
        parsed = json.loads((output / "desc.json").read_text(encoding="utf-8"))
        self.assertEqual(parsed["kind"], "planar")
        with self.assertRaises(FileExistsError):
            write_bundle(
                output_directory=output,
                descriptor=descriptor,
                data=data,
                cache=None,
                overwrite=False,
            )

        replacement = {"kind": "motion", "video": info.path.name}
        write_bundle(
            output_directory=output,
            descriptor=replacement,
            data=data,
            cache=None,
            overwrite=True,
        )
        parsed = json.loads((output / "desc.json").read_text(encoding="utf-8"))
        self.assertEqual(parsed["kind"], "motion")

    def test_bundle_writer_preserves_existing_output_on_serialization_error(
        self,
    ) -> None:
        output = self.root / "preserve-on-error"
        output.mkdir()
        marker = output / "marker.txt"
        marker.write_text("keep", encoding="utf-8")

        with self.assertRaises(TypeError):
            write_bundle(
                output_directory=output,
                descriptor={"notJson": {1, 2, 3}},
                data={"baseline": None, "data": []},
                cache=None,
                overwrite=True,
            )

        self.assertEqual(marker.read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
