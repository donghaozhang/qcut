import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

const RUNTIME_MANIFEST_FILE_NAME = "qcut-effect-runtime.json";
const HASH_CONCURRENCY = 4;
export const VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES = [
  [
    "Frameworks/libAGFX.dylib",
    "1b9493940eebda3b79d72b7308adf8abfbff56c9cfce9d7d73b31cd080453eee",
  ],
  [
    "Frameworks/libByteVC1_dec.dylib",
    "1934d8af041763669bf671ae4bc36920b50a671112eee97e238d59e2c6f4f80a",
  ],
  [
    "Frameworks/libEGL.dylib",
    "9b47714f4e4db6a99567a361df7d68fe3f1ba1ce0f2277a7c2d13f8df144cedc",
  ],
  [
    "Frameworks/libGLESv2.dylib",
    "6553b3bf3900e51c31d81d1734b689410aec7eedd48e199b8909e6824763842f",
  ],
  [
    "Frameworks/libIESAppLogger.dylib",
    "90e6e7b203d42c3315c704e4912288e9a6e9fab7db310e404a48657b1c662687",
  ],
  [
    "Frameworks/libLumiGeneRuntime.dylib",
    "2ef804016a7e3c359c9cbb430a33d15eee37b6a9c274e27d00246dfdadb907ab",
  ],
  [
    "Frameworks/libavcodec.dylib",
    "83dcaf3834b561ef9cb7dfe23979053932ae075e33bae60c1c1ffccdb2f3c831",
  ],
  [
    "Frameworks/libavdevice.dylib",
    "e50acfe1423795507e0e8a8beec6a22504e4b3484961d617700cc1389f33e0c9",
  ],
  [
    "Frameworks/libavfilter.dylib",
    "04bca9d6227f80b916fa149f2f786e6ccfaa264e58d3903d3eccc347eb6e6ea0",
  ],
  [
    "Frameworks/libavformat.dylib",
    "e3e123b6f6efdfebbd20fbd554006a6da8348671150eaa8ff27999edad00dc04",
  ],
  [
    "Frameworks/libavutil.dylib",
    "647f031c96f4e75506c8a663970e06594f15ac76196b1d0d82e1f2c1273b8fd1",
  ],
  [
    "Frameworks/libbytenn.dylib",
    "febfce4549cd6337c232c22ed00463a54cda7b255c4961426a33bfc78542b863",
  ],
  [
    "Frameworks/libcccreator.dylib",
    "0c39324edc0d8997d7c998c6a0867803b667fd40969e231a90ea502cc1e815b9",
  ],
  [
    "Frameworks/libdav1d.dylib",
    "08f14e26884aa68653471bf737d1e619def2376d256c57265dc443bdf8fc3751",
  ],
  [
    "Frameworks/libfastcv.dylib",
    "679fc0665d9e24a6130f1bf53cc04d7a54edde4fcba6d9607e4559b627ae066f",
  ],
  [
    "Frameworks/libffmpeg.dylib",
    "f9d7e2346b80bb14265ee274bb69cadaa5e7d8b86ab14339290f9fa6cb2231e5",
  ],
  [
    "Frameworks/liblens.dylib",
    "fdf576dd066a11db7b54d815621893ed62a8ed223e22834d5753738dc66df161",
  ],
  [
    "Frameworks/libmp3lame.0.dylib",
    "7e94d5e4ac4f9bba67399b3f161fb4f6297ed9a56e7772ca805ebbd2e8905294",
  ],
  [
    "Frameworks/libsamicore.dylib",
    "79494a89151fbf4b11ac8093e993a58ca075b2f379d17b4ccba309ec1aca6214",
  ],
  [
    "Frameworks/libsscronet.dylib",
    "0f9f0b5adfd2128dc12b1885c60b5f4a0099fb0cddf0fbc5f8eef108a0f2428c",
  ],
  [
    "Frameworks/libswresample.dylib",
    "b87bdbb71fb77ebe00a25709fc47ffaf2edbd9850aff698ba8e6e0fa2e4db53d",
  ],
  [
    "Frameworks/libswscale.dylib",
    "114efa544ceced50e59d24956ae4bb8d0b42679389f0e251b6da43fde1b918bd",
  ],
  [
    "Frameworks/libvecryptor.dylib",
    "8cc1f5cf094ee0dd8673a3c626f51892d6bd37ea15a178e3c80246c939a3a81e",
  ],
] as const;

export const VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256 =
  "e462db26eb23dc6b21829912dd97010b9dde33ee6659f22a481c11690c0f7c2e";
export const VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER = `jianying-runtime-framework-closure-d634-v1-${VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256}`;

interface RuntimeManifestFile {
  bytes: number;
  path: string;
  sha256: string;
}

interface RuntimeManifest {
  cloudUpload: false;
  coreUuid: string;
  files: RuntimeManifestFile[];
  localOnly: true;
  schemaVersion: 1;
}

interface DependencyInspection {
  bytes: number;
  sha256: string | null;
}

type InspectDependency = (input: {
  filePath: string;
}) => Promise<DependencyInspection>;

function isSafeRelativePath({ value }: { value: string }) {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function parseRuntimeManifest({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const manifest = value as Partial<RuntimeManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.localOnly !== true ||
    manifest.cloudUpload !== false ||
    typeof manifest.coreUuid !== "string" ||
    !Array.isArray(manifest.files)
  ) {
    return null;
  }
  const filesAreValid = manifest.files.every((file) => {
    if (!file || typeof file !== "object") return false;
    return (
      typeof file.path === "string" &&
      isSafeRelativePath({ value: file.path }) &&
      Number.isSafeInteger(file.bytes) &&
      file.bytes >= 0 &&
      typeof file.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(file.sha256)
    );
  });
  if (!filesAreValid) return null;
  const paths = manifest.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) return null;
  return manifest as RuntimeManifest;
}

function dependencyClosureSha256({
  dependencies,
}: {
  dependencies: ReadonlyArray<readonly [string, string]>;
}) {
  const canonical = [...dependencies]
    .sort(([leftPath], [rightPath]) =>
      leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0,
    )
    .map(
      ([dependencyPath, sha256]) =>
        `${path.posix.basename(dependencyPath)}=${sha256}\n`,
    )
    .join("");
  return createHash("sha256").update(canonical).digest("hex");
}

async function sha256Stream({ filePath }: { filePath: string }) {
  const hash = createHash("sha256");
  await pipeline(
    createReadStream(filePath),
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    }),
  );
  return hash.digest("hex");
}

async function inspectDependency({
  filePath,
}: {
  filePath: string;
}): Promise<DependencyInspection> {
  const [metadata, sha256] = await Promise.all([
    stat(filePath),
    sha256Stream({ filePath }),
  ]);
  return {
    bytes: metadata.isFile() ? metadata.size : -1,
    sha256,
  };
}

export async function verifyVideoObjectBachDependencyClosure({
  expectedCoreUuid,
  expectedRuntimeSha256,
  inspect = inspectDependency,
  runtimeRoot,
}: {
  expectedCoreUuid: string;
  expectedRuntimeSha256: string;
  inspect?: InspectDependency;
  runtimeRoot: string;
}) {
  const manifest = parseRuntimeManifest({
    value: JSON.parse(
      await readFile(
        path.join(runtimeRoot, RUNTIME_MANIFEST_FILE_NAME),
        "utf8",
      ),
    ) as unknown,
  });
  if (!manifest || manifest.coreUuid !== expectedCoreUuid) {
    throw new Error(
      "Jianying runtime manifest does not match the audited UUID",
    );
  }
  const manifestByPath = new Map(
    manifest.files.map((file) => [file.path, file]),
  );
  const runtimeEntry = manifestByPath.get("Frameworks/libcccreator.dylib");
  if (!runtimeEntry || runtimeEntry.sha256 !== expectedRuntimeSha256) {
    throw new Error("Jianying runtime manifest does not pin libcccreator");
  }
  const manifestFrameworkPaths = manifest.files
    .filter(
      (file) =>
        file.path.startsWith("Frameworks/") && file.path.endsWith(".dylib"),
    )
    .map((file) => file.path)
    .sort();
  const auditedFrameworkPaths =
    VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES.map(
      ([dependencyPath]) => dependencyPath,
    ).sort();
  if (
    JSON.stringify(manifestFrameworkPaths) !==
    JSON.stringify(auditedFrameworkPaths)
  ) {
    throw new Error("Jianying runtime dependency inventory is incomplete");
  }
  await mapWithConcurrency({
    items: VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES,
    limit: HASH_CONCURRENCY,
    task: async ({ item: [dependencyPath, expectedSha256] }) => {
      const manifestEntry = manifestByPath.get(dependencyPath);
      if (!manifestEntry || manifestEntry.sha256 !== expectedSha256) {
        throw new Error(
          `Jianying runtime manifest has a mixed dependency: ${dependencyPath}`,
        );
      }
      const actual = await inspect({
        filePath: path.join(runtimeRoot, ...dependencyPath.split("/")),
      });
      if (
        actual.sha256 !== expectedSha256 ||
        actual.bytes !== manifestEntry.bytes
      ) {
        throw new Error(
          `Jianying runtime dependency checksum mismatch: ${dependencyPath}`,
        );
      }
    },
  });
  const actualClosureSha256 = dependencyClosureSha256({
    dependencies: VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES,
  });
  if (actualClosureSha256 !== VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256) {
    throw new Error("Jianying runtime dependency closure identity is stale");
  }
  return {
    dependencyClosureMarker: VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
    dependencyClosureSha256: actualClosureSha256,
  };
}
