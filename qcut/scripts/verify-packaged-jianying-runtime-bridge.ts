import { execFile, execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MACH_O_MAGICS = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xcafebabf,
  0xbebafeca, 0xbfbafeca,
]);
const DYLD_RUNTIME_BRIDGES = new Set([
  "jianying-person-cutout-bridge",
  "jianying-saliency-script-bridge",
  "jianying-transition-bridge",
  "jianying-video-object-bach-bridge",
]);

export function requiresDyldRuntimeEntitlements({
  bridgeFileName,
}: {
  bridgeFileName: string;
}) {
  return DYLD_RUNTIME_BRIDGES.has(bridgeFileName);
}

async function newestPackagedBridge({
  distRoot,
  bridgeFileName,
}: {
  distRoot: string;
  bridgeFileName: string;
}) {
  const entries = await readdir(distRoot, { recursive: true }).catch(() => []);
  const suffix = path.join("Contents", "Resources", "bin", bridgeFileName);
  const candidates = entries
    .filter((entry) => entry.endsWith(suffix))
    .map((entry) => path.join(distRoot, entry));
  if (candidates.length === 0) {
    throw new Error(
      `Packaged Jianying runtime bridge not found under ${distRoot}: ${bridgeFileName}`,
    );
  }
  const metadata = await Promise.all(
    candidates.map(async (filePath) => ({
      filePath,
      modifiedAt: (await stat(filePath)).mtimeMs,
    })),
  );
  return metadata.sort((left, right) => right.modifiedAt - left.modifiedAt)[0]
    .filePath;
}

async function requireExecutable({ filePath }: { filePath: string }) {
  try {
    await access(filePath, constants.X_OK);
  } catch {
    throw new Error(`Jianying runtime bridge is not executable: ${filePath}`);
  }
}

function isMachO({ contents }: { contents: Buffer }) {
  return contents.length >= 4 && MACH_O_MAGICS.has(contents.readUInt32BE(0));
}

export function parseMachOUuidOutput({ output }: { output: string }) {
  return output
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/UUID:\s+([0-9A-F-]+)\s+\(([^)]+)\)/i);
      return match ? [`${match[2]}:${match[1].toUpperCase()}`] : [];
    })
    .sort();
}

async function machOUuids({ filePath }: { filePath: string }) {
  const { stdout } = await execFileAsync("dwarfdump", ["--uuid", filePath]);
  const identities = parseMachOUuidOutput({ output: stdout });
  if (identities.length === 0) {
    throw new Error(`Mach-O UUID not found: ${filePath}`);
  }
  return identities;
}

async function requireValidCodeSignature({ filePath }: { filePath: string }) {
  try {
    await execFileAsync("codesign", ["--verify", "--strict", filePath]);
  } catch {
    throw new Error(
      `Packaged Jianying runtime bridge has an invalid signature: ${filePath}`,
    );
  }
}

export async function requireTransitionBridgeEntitlements({
  filePath,
}: {
  filePath: string;
}) {
  const { stdout } = await execFileAsync("/usr/bin/codesign", [
    "--display",
    "--entitlements",
    "-",
    "--xml",
    filePath,
  ]);
  const entitlements: Record<string, unknown> = JSON.parse(
    execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
      input: stdout,
      encoding: "utf8",
      timeout: 10_000,
    }),
  );
  for (const key of [
    "com.apple.security.cs.allow-dyld-environment-variables",
    "com.apple.security.cs.disable-library-validation",
  ]) {
    if (entitlements[key] !== true) {
      throw new Error(
        `Packaged Jianying runtime bridge is missing required entitlement ${key}: ${filePath}`,
      );
    }
  }
}

async function requireMatchingBridge({
  packaged,
  packagedPath,
  staged,
  stagedPath,
}: {
  packaged: Buffer;
  packagedPath: string;
  staged: Buffer;
  stagedPath: string;
}) {
  const stagedIsMachO = isMachO({ contents: staged });
  const packagedIsMachO = isMachO({ contents: packaged });
  if (stagedIsMachO && packagedIsMachO) {
    const [stagedUuids, packagedUuids] = await Promise.all([
      machOUuids({ filePath: stagedPath }),
      machOUuids({ filePath: packagedPath }),
    ]);
    if (JSON.stringify(stagedUuids) !== JSON.stringify(packagedUuids)) {
      throw new Error(
        `Packaged Jianying runtime bridge differs from the staged binary: ${path.basename(packagedPath)}`,
      );
    }
    await requireValidCodeSignature({ filePath: packagedPath });
    if (
      requiresDyldRuntimeEntitlements({
        bridgeFileName: path.basename(packagedPath),
      })
    ) {
      await requireTransitionBridgeEntitlements({ filePath: packagedPath });
    }
    return;
  }
  if (stagedIsMachO !== packagedIsMachO || !staged.equals(packaged)) {
    throw new Error(
      `Packaged Jianying runtime bridge differs from the staged binary: ${path.basename(packagedPath)}`,
    );
  }
}

export async function verifyPackagedJianyingRuntimeBridge({
  bridgeFileName,
  distRoot,
  projectRoot,
}: {
  bridgeFileName: string;
  distRoot: string;
  projectRoot: string;
}) {
  const stagedPath = path.join(
    projectRoot,
    "electron",
    "resources",
    "bin",
    bridgeFileName,
  );
  const packagedPath = await newestPackagedBridge({
    distRoot,
    bridgeFileName,
  });
  await Promise.all([
    requireExecutable({ filePath: stagedPath }),
    requireExecutable({ filePath: packagedPath }),
  ]);
  const [staged, packaged] = await Promise.all([
    readFile(stagedPath),
    readFile(packagedPath),
  ]);
  await requireMatchingBridge({ packaged, packagedPath, staged, stagedPath });
  return packagedPath;
}
