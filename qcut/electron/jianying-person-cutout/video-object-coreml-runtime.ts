import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  withAtomicPublishLock,
  type AtomicPublishLockTiming,
} from "./atomic-publish-lock.js";

const execFileAsync = promisify(execFile);
const COREML_BUNDLE_NAME = "20440.3_sod_fp16.mlmodelc";
export const COREML_BUNDLE_MANIFEST_FILE_NAME =
  "qcut-coreml-bundle-manifest.json";
const COREML_INPUTS = new Map([
  ["data", "[1, 3, 256, 256]"],
  ["prev_img", "[1, 3, 256, 256]"],
  ["prev_mask", "[1, 1, 256, 256]"],
]);
const COREML_OUTPUTS = new Map([["nn_3", "[]"]]);
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface CoreMLBundleManifest {
  bundleName: string;
  files: Array<{
    path: string;
    sha256: string;
    size: number;
  }>;
  packedModelSha256: string;
  version: 1;
}

const VERIFIED_VIDEO_OBJECT_BUNDLE_MANIFEST: CoreMLBundleManifest = {
  bundleName: COREML_BUNDLE_NAME,
  packedModelSha256:
    "346b64693e02775faff84b6506e6aa8fb399d1060ab7eb3448157eef741849ef",
  version: 1,
  files: [
    {
      path: "analytics/coremldata.bin",
      sha256:
        "cd9a772b591e4c19aabbfc76457913d3061313ead4db4ef2ede1aa1d4f92ed3d",
      size: 448,
    },
    {
      path: "coremldata.bin",
      sha256:
        "a04a8dd8a953d4292f6d65c4972e14859712d20388194ba455615986801d3530",
      size: 312,
    },
    {
      path: "metadata.json",
      sha256:
        "1e30c88154a65badfe0a44b4eca0f0080c2e191d9dbad30beb1185ea95402356",
      size: 2340,
    },
    {
      path: "model.espresso.net",
      sha256:
        "56e3131e2cca1fd653e77d10bf898e35be812352a7d751cf5c5cb7ce1324b4e4",
      size: 150_812,
    },
    {
      path: "model.espresso.shape",
      sha256:
        "0f435dac861c71d03274741a827a56be2325c981c5f11a92e677f2e34e2c8d48",
      size: 33_134,
    },
    {
      path: "model.espresso.weights",
      sha256:
        "1f7c0984c6500a8024ffde3989b3eadc44d6c4377b9ac650bea46a44789d9402",
      size: 10_826_016,
    },
    {
      path: "model/coremldata.bin",
      sha256:
        "f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
      size: 64,
    },
    {
      path: "neural_network_optionals/coremldata.bin",
      sha256:
        "5931bd536c4550294a212c6fc8d3c1bee75da817980ba0b671c8603dafb36238",
      size: 40,
    },
  ],
};

interface CoreMLFeatureSchema {
  name?: unknown;
  shape?: unknown;
}

interface CoreMLMetadata {
  inputSchema?: unknown;
  outputSchema?: unknown;
}

function matchesSchema({
  expected,
  value,
}: {
  expected: ReadonlyMap<string, string>;
  value: unknown;
}) {
  if (!Array.isArray(value) || value.length !== expected.size) return false;
  const schemas = value as CoreMLFeatureSchema[];
  return schemas.every(
    (schema) =>
      typeof schema.name === "string" &&
      typeof schema.shape === "string" &&
      expected.get(schema.name) === schema.shape,
  );
}

function normalizedManifest({
  manifest,
}: {
  manifest: CoreMLBundleManifest;
}): CoreMLBundleManifest {
  return {
    ...manifest,
    files: [...manifest.files].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

function manifestContents({ manifest }: { manifest: CoreMLBundleManifest }) {
  return `${JSON.stringify(normalizedManifest({ manifest }), null, 2)}\n`;
}

async function hasExpectedTensorSchema({ bundlePath }: { bundlePath: string }) {
  try {
    const metadataValue: unknown = JSON.parse(
      await readFile(path.join(bundlePath, "metadata.json"), "utf8"),
    );
    if (!Array.isArray(metadataValue) || metadataValue.length !== 1)
      return false;
    const metadata = metadataValue[0] as CoreMLMetadata;
    return (
      matchesSchema({ expected: COREML_INPUTS, value: metadata.inputSchema }) &&
      matchesSchema({ expected: COREML_OUTPUTS, value: metadata.outputSchema })
    );
  } catch {
    return false;
  }
}

async function listBundleFiles({
  bundlePath,
  directory = bundlePath,
}: {
  bundlePath: string;
  directory?: string;
}): Promise<string[] | null> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(
      entries.map(async (entry): Promise<string[] | null> => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return listBundleFiles({ bundlePath, directory: absolutePath });
        }
        if (!entry.isFile()) return null;
        return [
          path.relative(bundlePath, absolutePath).split(path.sep).join("/"),
        ];
      }),
    );
    if (nestedFiles.some((files) => files === null)) return null;
    return nestedFiles.flatMap((files) => files ?? []).sort();
  } catch {
    return null;
  }
}

async function hasExpectedBundleContents({
  bundlePath,
  manifest,
}: {
  bundlePath: string;
  manifest: CoreMLBundleManifest;
}) {
  if (path.basename(bundlePath) !== manifest.bundleName) return false;
  const expectedFiles = normalizedManifest({ manifest }).files;
  const actualPaths = await listBundleFiles({ bundlePath });
  if (
    actualPaths === null ||
    actualPaths.length !== expectedFiles.length ||
    actualPaths.some(
      (actualPath, index) => actualPath !== expectedFiles[index].path,
    )
  ) {
    return false;
  }
  try {
    const matches = await Promise.all(
      expectedFiles.map(async (expectedFile) => {
        const contents = await readFile(
          path.join(bundlePath, ...expectedFile.path.split("/")),
        );
        return (
          contents.length === expectedFile.size &&
          createHash("sha256").update(contents).digest("hex") ===
            expectedFile.sha256
        );
      }),
    );
    return (
      matches.every(Boolean) && (await hasExpectedTensorSchema({ bundlePath }))
    );
  } catch {
    return false;
  }
}

async function isPublishedBundleValid({
  bundlePath,
  cacheDirectory,
  manifest,
}: {
  bundlePath: string;
  cacheDirectory: string;
  manifest: CoreMLBundleManifest;
}) {
  try {
    const publishedManifest = await readFile(
      path.join(cacheDirectory, COREML_BUNDLE_MANIFEST_FILE_NAME),
      "utf8",
    );
    if (publishedManifest !== manifestContents({ manifest })) return false;
    return hasExpectedBundleContents({ bundlePath, manifest });
  } catch {
    return false;
  }
}

export function findPackedCoreMLArchiveOffset({
  modelContents,
}: {
  modelContents: Buffer;
}) {
  const offset = modelContents.indexOf(ZIP_LOCAL_FILE_HEADER);
  if (offset <= 0) {
    throw new Error("物体抠像模型不包含可读取的 CoreML 网络");
  }
  return offset;
}

function coreMLCacheRoot() {
  return (
    process.env.QCUT_VIDEO_OBJECT_COREML_CACHE_ROOT ??
    path.join(
      os.homedir(),
      "Library",
      "Caches",
      "QCut",
      "jianying-video-object-coreml",
    )
  );
}

export function createVideoObjectCoreMLCache({
  expectedManifest,
  lockTiming,
}: {
  expectedManifest: CoreMLBundleManifest;
  lockTiming?: AtomicPublishLockTiming;
}) {
  const manifest = normalizedManifest({ manifest: expectedManifest });

  async function isReadable({ modelPath }: { modelPath: string }) {
    try {
      await access(modelPath, constants.R_OK);
      return isPublishedBundleValid({
        bundlePath: modelPath,
        cacheDirectory: path.dirname(modelPath),
        manifest,
      });
    } catch {
      return false;
    }
  }

  async function prepare({
    modelPath,
    modelSha256,
  }: {
    modelPath: string;
    modelSha256: string;
  }) {
    if (modelSha256 !== manifest.packedModelSha256) {
      throw new Error("物体抠像 packed model 与 CoreML 内容清单不匹配");
    }
    const cacheRoot = coreMLCacheRoot();
    const cacheDirectory = path.join(cacheRoot, modelSha256);
    const cachedBundle = path.join(cacheDirectory, manifest.bundleName);
    if (
      await isPublishedBundleValid({
        bundlePath: cachedBundle,
        cacheDirectory,
        manifest,
      })
    ) {
      return cachedBundle;
    }

    await mkdir(cacheRoot, { recursive: true });
    return withAtomicPublishLock({
      lockPath: path.join(cacheRoot, `${modelSha256}.publish-lock`),
      timing: lockTiming,
      action: async () => {
        if (
          await isPublishedBundleValid({
            bundlePath: cachedBundle,
            cacheDirectory,
            manifest,
          })
        ) {
          return cachedBundle;
        }

        const temporaryDirectory = await mkdtemp(
          path.join(cacheRoot, `${modelSha256}.extracting-`),
        );
        try {
          const modelContents = await readFile(modelPath);
          const archiveOffset = findPackedCoreMLArchiveOffset({
            modelContents,
          });
          const archivePath = path.join(temporaryDirectory, "model.zip");
          await writeFile(archivePath, modelContents.subarray(archiveOffset));
          await execFileAsync("/usr/bin/ditto", [
            "-x",
            "-k",
            archivePath,
            temporaryDirectory,
          ]);
          await rm(archivePath, { force: true });
          const extractedBundle = path.join(
            temporaryDirectory,
            manifest.bundleName,
          );
          if (
            !(await hasExpectedBundleContents({
              bundlePath: extractedBundle,
              manifest,
            }))
          ) {
            throw new Error("物体抠像 CoreML 网络内容不符合已验证模型");
          }
          await writeFile(
            path.join(temporaryDirectory, COREML_BUNDLE_MANIFEST_FILE_NAME),
            manifestContents({ manifest }),
            "utf8",
          );
          if (
            !(await isPublishedBundleValid({
              bundlePath: extractedBundle,
              cacheDirectory: temporaryDirectory,
              manifest,
            }))
          ) {
            throw new Error("物体抠像 CoreML 缓存发布校验失败");
          }
          await rm(cacheDirectory, { force: true, recursive: true });
          await rename(temporaryDirectory, cacheDirectory);
          return cachedBundle;
        } finally {
          await rm(temporaryDirectory, { force: true, recursive: true });
        }
      },
    });
  }

  return { isReadable, prepare };
}

const verifiedVideoObjectCoreMLCache = createVideoObjectCoreMLCache({
  expectedManifest: VERIFIED_VIDEO_OBJECT_BUNDLE_MANIFEST,
});

export const prepareVideoObjectCoreMLModel =
  verifiedVideoObjectCoreMLCache.prepare;
export const isReadableCoreMLModel = verifiedVideoObjectCoreMLCache.isReadable;
