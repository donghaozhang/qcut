import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cache_probe


class ProbeMediaTest(unittest.TestCase):
    def test_non_json_ffprobe_output_is_ignored(self) -> None:
        result = SimpleNamespace(returncode=0, stdout="not-json")
        with (
            patch.object(cache_probe.shutil, "which", return_value="ffprobe"),
            patch.object(cache_probe.subprocess, "run", return_value=result),
        ):
            self.assertIsNone(cache_probe.probe_audio(Path("broken.mp3")))


class DownloadEntriesTest(unittest.TestCase):
    def test_malformed_or_non_object_config_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            music_root = Path(temporary_directory)
            config_path = music_root / "downLoadcfg"

            for config in ('{"list": [', "[]", '"unexpected"'):
                with self.subTest(config=config):
                    config_path.write_text(config, encoding="utf-8")
                    self.assertEqual(cache_probe.download_entries(music_root), [])

    def test_valid_entries_ignore_incomplete_values(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            music_root = Path(temporary_directory)
            (music_root / "downLoadcfg").write_text(
                json.dumps(
                    {
                        "list": [
                            {"date": "1", "hex": "request", "path": "audio.mp3"},
                            {"date": "2", "hex": "", "path": "missing-key.mp3"},
                            {"date": None, "hex": None, "path": None},
                            {"date": 3, "hex": 123, "path": 456},
                            {"date": 4, "hex": "numeric-date", "path": "numeric.mp3"},
                            "unexpected",
                        ]
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                cache_probe.download_entries(music_root),
                [
                    {"date": "1", "hex": "request", "path": "audio.mp3"},
                    {
                        "date": "4",
                        "hex": "numeric-date",
                        "path": "numeric.mp3",
                    },
                ],
            )

    def test_invalid_utf8_config_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            music_root = Path(temporary_directory)
            (music_root / "downLoadcfg").write_bytes(b'\xff\xfe{"list": [')

            self.assertEqual(cache_probe.download_entries(music_root), [])


class ReadSnapshotTest(unittest.TestCase):
    def write_snapshot(self, directory: Path, music_root: object) -> Path:
        snapshot_path = directory / "snapshot.json"
        snapshot_path.write_text(
            json.dumps(
                {
                    "schema_version": cache_probe.SCHEMA_VERSION,
                    "music_root": music_root,
                    "files": {},
                    "download_entries": [],
                }
            ),
            encoding="utf-8",
        )
        return snapshot_path

    def test_rejects_missing_or_invalid_music_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            for music_root in (None, "", "   ", 123):
                with self.subTest(music_root=music_root):
                    snapshot_path = self.write_snapshot(directory, music_root)
                    with self.assertRaisesRegex(ValueError, "missing music_root"):
                        cache_probe.read_snapshot(snapshot_path)

    def test_rejects_non_object_snapshot_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            snapshot_path = Path(temporary_directory) / "snapshot.json"
            snapshot_path.write_text("[]\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "root must be an object"):
                cache_probe.read_snapshot(snapshot_path)

    def test_accepts_non_empty_music_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            snapshot_path = self.write_snapshot(directory, str(directory / "music"))

            snapshot = cache_probe.read_snapshot(snapshot_path)

            self.assertEqual(snapshot["music_root"], str(directory / "music"))


if __name__ == "__main__":
    unittest.main()
