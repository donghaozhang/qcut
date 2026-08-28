import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  withAtomicPublishLock,
  type AtomicPublishLockTiming,
} from "./atomic-publish-lock.js";

const execFileAsync = promisify(execFile);
export const VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME =
  "jianying-video-object-coreml-bridge";
const MINIMUM_BRIDGE_BYTES = 4096;
const MACH_O_MAGICS = [
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbf]),
] as const;
const REQUIRED_BRIDGE_MARKERS = ["video-object-same-model-coreml-v1"] as const;
const SOURCE_RELATIVE_PATHS = [
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "alpha-refinement.cpp",
  ),
  path.join("electron", "jianying-person-cutout", "native", "alpha-resize.cpp"),
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "video-object-coreml-preprocess.cpp",
  ),
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "video-object-coreml-bridge.mm",
  ),
] as const;
const FINGERPRINT_RELATIVE_PATHS = [
  ...SOURCE_RELATIVE_PATHS,
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "alpha-refinement.hpp",
  ),
  path.join("electron", "jianying-person-cutout", "native", "alpha-resize.hpp"),
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "video-object-coreml-preprocess.hpp",
  ),
] as const;

async function isExecutable({ filePath }: { filePath: string }) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isValidVideoObjectCoreMLBridge({
  filePath,
}: {
  filePath: string;
}) {
  if (!(await isExecutable({ filePath }))) return false;
  try {
    const image = await readFile(filePath);
    return (
      image.length >= MINIMUM_BRIDGE_BYTES &&
      MACH_O_MAGICS.some((magic) =>
        image.subarray(0, magic.length).equals(magic),
      ) &&
      REQUIRED_BRIDGE_MARKERS.every((marker) => image.includes(marker))
    );
  } catch {
    return false;
  }
}

function findProjectRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
  ];
  return (
    candidates.find((candidate) =>
      FINGERPRINT_RELATIVE_PATHS.every((relativePath) =>
        existsSync(path.join(candidate, relativePath)),
      ),
    ) ?? null
  );
}

function packagedBridgePath() {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath;
  return resourcesPath
    ? path.join(resourcesPath, "bin", VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME)
    : null;
}

export async function resolveVideoObjectCoreMLBridge() {
  if (process.platform !== "darwin") return null;
  for (const candidate of [
    process.env.QCUT_VIDEO_OBJECT_COREML_BRIDGE,
    packagedBridgePath(),
  ]) {
    if (
      candidate &&
      (await isValidVideoObjectCoreMLBridge({ filePath: candidate }))
    ) {
      return candidate;
    }
  }
  const projectRoot = findProjectRoot();
  if (!projectRoot) return null;
  const sourceHash = createHash("sha256");
  const fingerprintContents = await Promise.all(
    FINGERPRINT_RELATIVE_PATHS.map((relativePath) =>
      readFile(path.join(projectRoot, relativePath)),
    ),
  );
  for (const contents of fingerprintContents) {
    sourceHash.update(contents);
  }
  const fingerprint = sourceHash
    .update(process.arch)
    .digest("hex")
    .slice(0, 16);
  const outputPath = path.join(
    os.homedir(),
    "Library",
    "Caches",
    "QCut",
    "jianying-video-object-coreml-bridge",
    fingerprint,
    VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME,
  );
  if (await isValidVideoObjectCoreMLBridge({ filePath: outputPath }))
    return outputPath;
  return compileVideoObjectCoreMLBridge({ outputPath, projectRoot });
}

export async function compileVideoObjectCoreMLBridge({
  lockTiming,
  outputPath,
  projectRoot,
}: {
  lockTiming?: AtomicPublishLockTiming;
  outputPath: string;
  projectRoot: string;
}) {
  if (await isValidVideoObjectCoreMLBridge({ filePath: outputPath }))
    return outputPath;
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await execFileAsync(
      "xcrun",
      [
        "clang++",
        "-std=c++20",
        "-fobjc-arc",
        "-Wall",
        "-Wextra",
        "-Werror",
        ...SOURCE_RELATIVE_PATHS.map((relativePath) =>
          path.join(projectRoot, relativePath),
        ),
        "-framework",
        "CoreML",
        "-framework",
        "Foundation",
        "-o",
        temporaryPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    if (!(await isValidVideoObjectCoreMLBridge({ filePath: temporaryPath }))) {
      throw new Error("物体抠像 CoreML 本机桥构建产物无效");
    }
    return await withAtomicPublishLock({
      lockPath: `${outputPath}.publish-lock`,
      timing: lockTiming,
      action: async () => {
        if (await isValidVideoObjectCoreMLBridge({ filePath: outputPath })) {
          return outputPath;
        }
        await rm(outputPath, { force: true });
        await rename(temporaryPath, outputPath);
        if (!(await isValidVideoObjectCoreMLBridge({ filePath: outputPath }))) {
          await rm(outputPath, { force: true });
          throw new Error("物体抠像 CoreML 本机桥发布校验失败");
        }
        return outputPath;
      },
    });
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
