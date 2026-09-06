#!/usr/bin/env python3
"""Exercise both executable intensity contracts using only the Python standard library."""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile


def run(command, pixels=None):
    result = subprocess.run(command, input=pixels, capture_output=True, timeout=30)
    if result.returncode:
        raise AssertionError(result.stderr.decode(errors="replace"))
    return result


def verify(image_cli, stream_cli, directory):
    width, height = 17, 9
    source = directory / "input.rgba"
    output = directory / "output.rgba"
    atlas = directory / "atlas.rgba"
    atlas.write_bytes(bytes([30, 170, 90, 255]) * (512 * 512))
    run([image_cli, "--demo", "--width", str(width), "--height", str(height),
         "--intensity", "0", "--output", str(source)])
    frame = source.read_bytes()
    image_args = [image_cli, "--input", str(source), "--output", str(output),
                  "--lut", str(atlas), "--width", str(width), "--height", str(height)]
    stream_args = [stream_cli, "--lut", str(atlas), "--width", str(width), "--height", str(height)]
    outputs = {}
    checks = []
    for mode in (None, "output-mix", "ui-snapshot"):
        for strength in ("0", "0.37", "0.8", "0.81", "1"):
            flags = ["--intensity", strength]
            if mode is not None:
                flags += ["--intensity-mode", mode]
            image_result = run(image_args + flags)
            expected = output.read_bytes()
            assert len(expected) == len(frame)
            image_report = json.loads(image_result.stdout)
            assert image_report["intensity_mode"] == (mode or "output-mix")
            stream_result = run(stream_args + flags, frame * 2)
            assert stream_result.stdout == expected * 2, (mode, strength, "frame bytes")
            report = json.loads(stream_result.stderr)
            assert report["protocol"] == "rgba8-frames-v1"
            assert report["intensity_mode"] == (mode or "output-mix")
            assert report["frames"] == 2
            assert report["bytes_in"] == report["bytes_out"] == len(frame) * 2
            outputs[(mode, strength)] = expected
            checks.append({"mode": mode or "omitted", "intensity": strength, "frames": 2})

    for strength in ("0", "0.37", "0.8", "0.81", "1"):
        assert outputs[(None, strength)] == outputs[("output-mix", strength)]
    assert outputs[(None, "0")] == frame
    assert outputs[("ui-snapshot", "0")] != frame
    assert outputs[("ui-snapshot", "1")] == outputs[(None, "1")]
    assert outputs[("ui-snapshot", "0.37")] != outputs[(None, "0.37")]
    assert outputs[("ui-snapshot", "0.8")] != outputs[("ui-snapshot", "0.81")]

    for executable_args in (image_args, stream_args):
        for flags in (["--intensity-mode", "unknown"], ["--intensity-mode"],
                      ["--intensity-mode", "ui_snapshot"]):
            result = subprocess.run(executable_args + flags, input=b"", capture_output=True, timeout=30)
            assert result.returncode != 0 and result.stdout == b"", flags
    duplicate = subprocess.run(stream_args + ["--intensity-mode", "ui-snapshot",
                               "--intensity-mode", "output-mix"],
                               input=b"", capture_output=True, timeout=30)
    assert duplicate.returncode != 0 and b"duplicate option" in duplicate.stderr
    for mode in ("output-mix", "ui-snapshot"):
        flags = ["--intensity-mode", mode]
        empty = run(stream_args + flags, b"")
        assert empty.stdout == b"" and json.loads(empty.stderr)["frames"] == 0
        short = subprocess.run(stream_args + flags, input=frame[:-1], capture_output=True, timeout=30)
        assert short.returncode != 0 and short.stdout == b""
        assert b"short RGBA8 frame" in short.stderr
    help_result = run([stream_cli, "--help"])
    assert help_result.stdout == b"" and b"--intensity-mode" in help_result.stderr
    return {"passed": True, "matrix": checks, "invalid_modes_rejected": True,
            "duplicate_stream_mode_rejected": True, "empty_and_short_frames_checked": True,
            "default_compatible": True, "stdout_pixel_only": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image-cli", type=Path, required=True)
    parser.add_argument("--stream-cli", type=Path, required=True)
    arguments = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="soft-glow-cli-") as temporary:
        report = verify(str(arguments.image_cli.resolve()), str(arguments.stream_cli.resolve()), Path(temporary))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
