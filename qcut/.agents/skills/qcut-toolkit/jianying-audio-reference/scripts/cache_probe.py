#!/usr/bin/env python3
"""Snapshot Jianying's audio cache and report one-card download changes."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict


SCHEMA_VERSION = 1
DEFAULT_MUSIC_ROOT = (
    Path.home() / "Movies/JianyingPro/User Data/Cache/music"
)
AUDIO_SUFFIXES = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"}


class FileState(TypedDict):
    size: int
    mtime_ns: int


def resolved_music_root(raw_root: str | None) -> Path:
    return Path(raw_root).expanduser().resolve() if raw_root else DEFAULT_MUSIC_ROOT.resolve()


def audio_files(music_root: Path) -> list[Path]:
    if not music_root.is_dir():
        return []
    return sorted(
        entry
        for entry in music_root.iterdir()
        if entry.is_file() and entry.suffix.lower() in AUDIO_SUFFIXES
    )


def scan_files(music_root: Path) -> dict[str, FileState]:
    return {
        entry.name: {
            "size": entry.stat().st_size,
            "mtime_ns": entry.stat().st_mtime_ns,
        }
        for entry in audio_files(music_root)
    }


def download_entries(music_root: Path) -> list[dict[str, str]]:
    config_path = music_root / "downLoadcfg"
    if not config_path.is_file():
        return []
    config = json.loads(config_path.read_text(encoding="utf-8"))
    raw_entries = config.get("list", [])
    if not isinstance(raw_entries, list):
        return []
    entries: list[dict[str, str]] = []
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue
        date = str(raw_entry.get("date", ""))
        hex_value = str(raw_entry.get("hex", ""))
        path_value = str(raw_entry.get("path", ""))
        if hex_value and path_value:
            entries.append({"date": date, "hex": hex_value, "path": path_value})
    return entries


def entry_key(entry: dict[str, str]) -> tuple[str, str, str]:
    return (entry["date"], entry["hex"], entry["path"])


def content_md5(file_path: Path) -> str:
    digest = hashlib.md5()
    with file_path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe_audio(file_path: Path) -> dict[str, object] | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels",
            "-of",
            "json",
            str(file_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)


def write_snapshot(output_path: Path, music_root: Path) -> None:
    snapshot = {
        "schema_version": SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "music_root": str(music_root),
        "files": scan_files(music_root),
        "download_entries": download_entries(music_root),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def read_snapshot(snapshot_path: Path) -> dict[str, object]:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    if snapshot.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported snapshot schema: {snapshot.get('schema_version')}")
    if not isinstance(snapshot.get("files"), dict):
        raise ValueError("Snapshot is missing files")
    if not isinstance(snapshot.get("download_entries"), list):
        raise ValueError("Snapshot is missing download_entries")
    return snapshot


def changed_files(
    previous_files: dict[str, object], current_files: dict[str, FileState]
) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    for file_name, current_state in current_files.items():
        previous_state = previous_files.get(file_name)
        if not isinstance(previous_state, dict):
            reason = "new-file"
        elif current_state["size"] != int(previous_state.get("size", -1)):
            reason = "size-changed"
        elif current_state["mtime_ns"] > int(previous_state.get("mtime_ns", 0)):
            reason = "newer-file"
        else:
            continue
        changes.append({"path": file_name, "reason": reason, **current_state})
    return sorted(changes, key=lambda change: int(change["mtime_ns"]), reverse=True)


def run_mark(args: argparse.Namespace) -> int:
    music_root = resolved_music_root(args.root)
    output_path = Path(args.output).expanduser().resolve()
    write_snapshot(output_path, music_root)
    print(
        json.dumps(
            {"snapshot": str(output_path), "music_root": str(music_root)},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def run_diff(args: argparse.Namespace) -> int:
    snapshot_path = Path(args.snapshot).expanduser().resolve()
    snapshot = read_snapshot(snapshot_path)
    snapshot_root = snapshot.get("music_root")
    music_root = resolved_music_root(args.root or str(snapshot_root))
    previous_files = snapshot["files"]
    previous_entries = snapshot["download_entries"]
    if not isinstance(previous_files, dict) or not isinstance(previous_entries, list):
        raise ValueError("Invalid snapshot payload")

    changes = changed_files(previous_files, scan_files(music_root))
    detailed_changes: list[dict[str, object]] = []
    for change in changes:
        file_path = music_root / str(change["path"])
        detailed_changes.append(
            {
                **change,
                "absolute_path": str(file_path),
                "content_md5": content_md5(file_path),
                "ffprobe": probe_audio(file_path),
            }
        )

    previous_keys = {
        entry_key(entry)
        for entry in previous_entries
        if isinstance(entry, dict)
        and all(isinstance(entry.get(key), str) for key in ("date", "hex", "path"))
    }
    new_entries = [
        entry
        for entry in download_entries(music_root)
        if entry_key(entry) not in previous_keys
    ]
    print(
        json.dumps(
            {
                "snapshot": str(snapshot_path),
                "title": args.title,
                "music_root": str(music_root),
                "changed_file_count": len(detailed_changes),
                "changed_files": detailed_changes,
                "new_download_entry_count": len(new_entries),
                "new_download_entries": new_entries,
                "unambiguous_single_audio": len(detailed_changes) == 1,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Map one Jianying sound-effect action to audio-cache changes."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    mark_parser = subparsers.add_parser("mark", help="Record the current audio cache.")
    mark_parser.add_argument("--output", required=True, help="Snapshot JSON path.")
    mark_parser.add_argument("--root", help="Override the Jianying music cache root.")
    mark_parser.set_defaults(handler=run_mark)

    diff_parser = subparsers.add_parser("diff", help="List changes since a snapshot.")
    diff_parser.add_argument("--snapshot", required=True, help="Snapshot JSON path.")
    diff_parser.add_argument("--root", help="Override the snapshot music cache root.")
    diff_parser.add_argument("--title", help="Visible card title for the evidence report.")
    diff_parser.set_defaults(handler=run_diff)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
