#!/usr/bin/env python3
"""Compare the independent executable with an existing private raw-RGBA oracle."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def measurements(actual, expected):
    if len(actual) != len(expected) or len(actual) % 4:
        raise ValueError("RGBA byte counts differ or are invalid")
    rgb = [abs(a - b) for i, (a, b) in enumerate(zip(actual, expected)) if i % 4 != 3]
    alpha = [abs(a - b) for i, (a, b) in enumerate(zip(actual, expected)) if i % 4 == 3]
    return {
        "rgb_mae": sum(rgb) / len(rgb),
        "rgb_rmse": math.sqrt(sum(d * d for d in rgb) / len(rgb)),
        "rgb_max": max(rgb),
        "alpha_max": max(alpha),
        "rgb_exact_percent": 100 * rgb.count(0) / len(rgb),
        "rgb_within_one_percent": 100 * sum(d <= 1 for d in rgb) / len(rgb),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--max-mae", type=float, default=0.25)
    parser.add_argument("--max-error", type=int, default=8)
    options = parser.parse_args()
    root = options.evidence.resolve()
    oracle = json.loads((root / "oracle/manifest.json").read_text())
    destination = root / "cpp-verification"
    destination.mkdir(exist_ok=True)
    results = []
    for case in oracle["results"]:
        name = case["fixture"]
        if Path(name).name != name:
            raise ValueError("invalid fixture name")
        source = root / "inputs" / f"{name}.rgba"
        reference = Path(case["finalRaw"])
        if digest(source) != case["inputSha256"]:
            raise ValueError(f"input hash changed: {name}")
        if not case["stable"] or len(set(case["a"]["hashes"] + case["b"]["hashes"])) != 1:
            raise ValueError(f"unstable native oracle: {name}")
        if digest(reference) != case["a"]["hashes"][0]:
            raise ValueError(f"reference hash changed: {name}")
        runs = []
        for repeat in range(2):
            output = destination / f"{name}-{case['intensity']}-{repeat}.rgba"
            command = [
                str(options.executable.resolve()), "--input", str(source),
                "--width", str(case["width"]), "--height", str(case["height"]),
                "--lut", str(root / "private-lut/reference-map2.rgba"),
                "--intensity", str(case["intensity"] / 100), "--output", str(output),
            ]
            completed = subprocess.run(command, check=True, text=True, capture_output=True)
            runs.append({"path": str(output), "sha256": digest(output), "run": json.loads(completed.stdout)})
        metric = measurements(Path(runs[0]["path"]).read_bytes(), reference.read_bytes())
        stable = runs[0]["sha256"] == runs[1]["sha256"]
        passed = stable and metric["rgb_mae"] <= options.max_mae and metric["rgb_max"] <= options.max_error and metric["alpha_max"] == 0
        result = {"fixture": name, "intensity": case["intensity"], "metrics": metric,
                  "deterministic": stable, "within_tolerance": passed, "runs": runs,
                  "input_sha256": digest(source), "reference_sha256": digest(reference)}
        results.append(result)
        print(f"{name} {case['intensity']}% MAE={metric['rgb_mae']:.6f} max={metric['rgb_max']} stable={stable}")
    source_root = Path(__file__).resolve().parent
    source_hashes = {p.name: digest(p) for p in sorted(source_root.iterdir())
                     if p.suffix in {".cpp", ".hpp", ".py"} or p.name == "CMakeLists.txt"}
    report = {
        "contract": "opaque RGBA8; static scene; output-blend intensity; private D634 CGL oracle",
        "tolerance": {"rgb_mae": options.max_mae, "rgb_max": options.max_error, "alpha_max": 0},
        "bit_exact_claim": False,
        "all_within_tolerance": all(row["within_tolerance"] for row in results),
        "executable_sha256": digest(options.executable),
        "lut_sha256": digest(root / "private-lut/reference-map2.rgba"),
        "source_sha256": source_hashes,
        "results": results,
    }
    (destination / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    return 0 if report["all_within_tolerance"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
