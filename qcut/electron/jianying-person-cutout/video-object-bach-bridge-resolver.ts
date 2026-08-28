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
import { VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER } from "./video-object-runtime-closure.js";

const execFileAsync = promisify(execFile);
export const VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME =
  "jianying-video-object-bach-bridge";
const MINIMUM_BRIDGE_BYTES = 4096;
const MACH_O_MAGICS = [
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbf]),
] as const;
export const VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS = [
  "video-object-jianying-bach-v2-exact-d634-v1",
  "TEMattingBlendEffectV2-vendor-exact",
  "vendor-v2-exact-no-qcut-refinement-v1",
  "qcut-alpha-refinement-after-vendor-v2-v1",
  VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
  "D6342ECD-5432-33F0-A2AD-0C28F5699994",
  "0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9",
  "797fab4d5b1f0118ae565d3f9128b6a5d550b6af559c6da764c3d7777e1f7f5b",
  "346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef",
] as const;
const SOURCE_RELATIVE_PATHS = [
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "alpha-refinement.cpp",
  ),
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "metal-matting-blend.cpp",
  ),
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "video-object-bach-bridge.mm",
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
  path.join(
    "electron",
    "jianying-person-cutout",
    "native",
    "metal-matting-blend.hpp",
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

export async function isValidVideoObjectBachBridge({
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
      VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS.every((marker) =>
        image.includes(marker),
      )
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
    ? path.join(resourcesPath, "bin", VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME)
    : null;
}

export async function resolveVideoObjectBachBridge() {
  if (process.platform !== "darwin" || process.arch !== "arm64") return null;
  for (const candidate of [
    process.env.QCUT_VIDEO_OBJECT_BACH_BRIDGE,
    packagedBridgePath(),
  ]) {
    if (
      candidate &&
      (await isValidVideoObjectBachBridge({ filePath: candidate }))
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
    "jianying-video-object-bach-bridge",
    fingerprint,
    VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME,
  );
  if (await isValidVideoObjectBachBridge({ filePath: outputPath }))
    return outputPath;
  return compileVideoObjectBachBridge({ outputPath, projectRoot });
}

export async function compileVideoObjectBachBridge({
  lockTiming,
  outputPath,
  projectRoot,
}: {
  lockTiming?: AtomicPublishLockTiming;
  outputPath: string;
  projectRoot: string;
}) {
  if (await isValidVideoObjectBachBridge({ filePath: outputPath }))
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
        "-Wno-deprecated-declarations",
        ...SOURCE_RELATIVE_PATHS.map((relativePath) =>
          path.join(projectRoot, relativePath),
        ),
        "-framework",
        "AppKit",
        "-framework",
        "OpenGL",
        "-framework",
        "CoreVideo",
        "-framework",
        "CoreFoundation",
        "-o",
        temporaryPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    if (!(await isValidVideoObjectBachBridge({ filePath: temporaryPath }))) {
      throw new Error("剪映同图抠像本机桥构建产物无效");
    }
    return await withAtomicPublishLock({
      lockPath: `${outputPath}.publish-lock`,
      timing: lockTiming,
      action: async () => {
        if (await isValidVideoObjectBachBridge({ filePath: outputPath })) {
          return outputPath;
        }
        await rm(outputPath, { force: true });
        await rename(temporaryPath, outputPath);
        if (!(await isValidVideoObjectBachBridge({ filePath: outputPath }))) {
          await rm(outputPath, { force: true });
          throw new Error("剪映同图抠像本机桥发布校验失败");
        }
        return outputPath;
      },
    });
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
