import json
import tempfile
import unittest
from pathlib import Path

import cache_probe


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
                            "unexpected",
                        ]
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                cache_probe.download_entries(music_root),
                [{"date": "1", "hex": "request", "path": "audio.mp3"}],
            )


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

    def test_accepts_non_empty_music_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            snapshot_path = self.write_snapshot(directory, str(directory / "music"))

            snapshot = cache_probe.read_snapshot(snapshot_path)

            self.assertEqual(snapshot["music_root"], str(directory / "music"))


if __name__ == "__main__":
    unittest.main()
