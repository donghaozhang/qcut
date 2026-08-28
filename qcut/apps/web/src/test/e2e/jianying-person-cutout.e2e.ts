import { _electron as electron } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import {
  createTestProject,
  navigateToProjects,
} from "./helpers/electron-helpers";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";

const sourcePath =
  process.env.QCUT_PERSON_VIDEO_PATH ??
  "/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/real-person-input-2s.mp4";
const evidenceDirectory =
  process.env.QCUT_PERSON_CUTOUT_EVIDENCE_DIRECTORY ??
  "/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-desktop-e2e-compatible";
const outputPath = join(evidenceDirectory, "desktop-person-cutout.webm");
const expectedRequestedRoute =
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_REQUESTED_ROUTE ?? "auto";
const expectedActualRouteValue =
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_ACTUAL_ROUTE ?? "portrait-gru";
const personCutoutRoutes = [
  "portrait-gru",
  "video-object",
  "saliency-script",
] as const;
type PersonCutoutRoute = (typeof personCutoutRoutes)[number];
if (
  !personCutoutRoutes.includes(expectedActualRouteValue as PersonCutoutRoute)
) {
  throw new Error(
    `Unsupported expected person-cutout route: ${expectedActualRouteValue}`,
  );
}
const expectedActualRoute = expectedActualRouteValue as PersonCutoutRoute;
const expectedRouteFallback =
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_ROUTE_FALLBACK === undefined
    ? true
    : process.env.QCUT_PERSON_CUTOUT_EXPECTED_ROUTE_FALLBACK === "1";
const expectedSecondRouteFallback =
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_SECOND_ROUTE_FALLBACK === "1";
const expectedBlendImplementation =
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_BLEND ??
  (expectedActualRoute === "video-object"
    ? "TEMattingBlendEffectV2-vendor-exact"
    : "TEMattingBlendEffectV2-compatible");
const expectedWidth = Number(
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_WIDTH ?? 360,
);
const expectedHeight = Number(
  process.env.QCUT_PERSON_CUTOUT_EXPECTED_HEIGHT ?? 640,
);

interface ExpectedExecutionDescriptor {
  pipelineId: string;
  provider: string;
  refinementProvider: string;
}

const portraitDescriptor: ExpectedExecutionDescriptor =
  process.env.QCUT_DISABLE_VISION_PERSON_FUSION === "1"
    ? {
        pipelineId: "qcut-gru-only-v1",
        provider: "qcut-local-person-matting-v1",
        refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
      }
    : {
        pipelineId: "qcut-gru-vision-fusion-v1",
        provider: "qcut-local-person-matting-v1",
        refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
      };
const expectedDescriptorByRoute: Record<
  PersonCutoutRoute,
  ExpectedExecutionDescriptor
> = {
  "portrait-gru": portraitDescriptor,
  "video-object": {
    pipelineId: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
    provider: "qcut-jianying-video-object-bach-v2-exact-d634-v1",
    refinementProvider: "vendor-v2-exact-no-qcut-refinement-v1",
  },
  "saliency-script": {
    pipelineId: "qcut-saliency-script-interop-experimental-v1",
    provider: "qcut-saliency-interop-experimental-v1",
    refinementProvider: "qcut-effect-graph-alpha-refinement-v1",
  },
};
const expectedExecutionDescriptor =
  expectedDescriptorByRoute[expectedActualRoute];

interface AlphaQualityRegion {
  height: number;
  maxMean?: number;
  minMean?: number;
  name: string;
  width: number;
  x: number;
  y: number;
}

interface AlphaQualityProfile {
  regions: AlphaQualityRegion[];
  sampleTime: number;
}

const alphaQualityProfiles: Record<string, AlphaQualityProfile> = {
  "real-person-input-2s.mp4": {
    sampleTime: 0.25,
    regions: [
      {
        name: "leftPersonCore",
        x: 15,
        y: 15,
        width: 135,
        height: 185,
        minMean: 100,
      },
      {
        name: "foregroundHands",
        x: 55,
        y: 285,
        width: 230,
        height: 205,
        minMean: 80,
      },
      {
        name: "upperRightBackground",
        x: 270,
        y: 60,
        width: 80,
        height: 130,
        maxMean: 64,
      },
    ],
  },
  "real-person-wide-2s.mp4": {
    sampleTime: 0.25,
    regions: [
      {
        name: "topBackground",
        x: 0,
        y: 0,
        width: 360,
        height: 32,
        maxMean: 8,
      },
      {
        name: "centerPerson",
        x: 90,
        y: 160,
        width: 180,
        height: 320,
        minMean: 100,
      },
    ],
  },
};
const alphaQualityProfile = alphaQualityProfiles[basename(sourcePath)];

interface CutoutMediaItem {
  id: string;
  duration: number;
  file: File;
  height: number;
  metadata?: {
    blendImplementation?: string;
    didModelRouteFallback?: boolean;
    hasAlpha?: boolean;
    hasAudio?: boolean;
    modelRoute?: string;
    pipelineId?: string;
    provider?: string;
    refinementProvider?: string;
    requestedModelRoute?: string;
    source?: string;
  };
  width: number;
}

interface CutoutHarnessWindow extends Window {
  __personCutoutStatusMessages?: string[];
  __personCutoutStatusObserver?: MutationObserver;
  __mediaStore: {
    getState: () => { mediaItems: CutoutMediaItem[] };
  };
  __timelineStore: {
    getState: () => {
      setSelectedElements: (
        elements: Array<{ trackId: string; elementId: string }>,
      ) => void;
      tracks: Array<{
        elements: Array<{
          id: string;
          masks?: Array<{
            sourceMediaId?: string;
            tracking?: { source?: string };
            type: string;
          }>;
          startTime: number;
          type: string;
        }>;
      }>;
    };
  };
  __playbackStore: {
    getState: () => { seek: (time: number) => void };
  };
  electronAPI: {
    writeFile: (path: string, bytes: ArrayBuffer) => Promise<boolean>;
  };
}

test.describe("QCut local person cutout", () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(sourcePath), "Real-person video fixture is missing");

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixtures before testInfo.
  test("renders, attaches, and plays an automatically routed mask", async ({}, testInfo) => {
    const profileDirectory = join(
      tmpdir(),
      `qcut-jianying-person-cutout-${process.pid}-${Date.now()}`,
    );
    const cacheRoot = join(profileDirectory, "person-cutout-cache");
    await rm(evidenceDirectory, { recursive: true, force: true });
    await mkdir(evidenceDirectory, { recursive: true });
    const electronApp = await electron.launch({
      args: [`--user-data-dir=${profileDirectory}`, "dist/electron/main.js"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        QCUT_PERSON_CUTOUT_CACHE_ROOT: cacheRoot,
      },
    });
    const runtimeLogChunks: string[] = [];
    if (process.env.QCUT_PERSON_CUTOUT_CAPTURE_RUNTIME_LOG === "1") {
      for (const stream of [
        electronApp.process().stdout,
        electronApp.process().stderr,
      ]) {
        stream?.on("data", (chunk: Buffer) => {
          runtimeLogChunks.push(chunk.toString("utf8"));
        });
      }
    }

    try {
      const page = await electronApp.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForFunction(
        () => Boolean(document.querySelector("#root")?.children.length),
        undefined,
        { timeout: 30_000 },
      );
      await page.evaluate(() => {
        localStorage.setItem("hasSeenOnboarding", "true");
      });
      await navigateToProjects(page);
      await createTestProject(page, "Automatic Person Cutout E2E");
      await uploadTestMedia(page, sourcePath);
      await page
        .getByTestId("media-item")
        .last()
        .dragTo(page.getByTestId("timeline-track").first());
      const timelineClip = page.getByTestId("timeline-element").last();
      await expect(timelineClip).toBeVisible();
      await timelineClip.click();
      const properties = page.getByTestId("media-properties");
      await expect(properties).toBeVisible();
      await properties
        .getByTestId("media-properties-visual-tabs")
        .getByRole("tab", { name: "抠像", exact: true })
        .click();
      await expect(
        properties.getByTestId("person-cutout-quality-fine"),
      ).toBeVisible();
      await properties.getByTestId("person-cutout-quality-fine").click();
      await properties
        .getByTestId("person-cutout-quality")
        .locator("..")
        .locator("summary")
        .click();
      await expect(properties.getByText("精细抠像已就绪")).toBeVisible({
        timeout: 30_000,
      });
      await properties.screenshot({
        path: join(evidenceDirectory, "01-fine-cutout-ready.png"),
        animations: "disabled",
      });

      const startButton = properties.getByRole("button", {
        name: "开始并应用",
      });
      await startButton.click();
      await expect(properties.getByTestId("person-cutout-result")).toBeVisible({
        timeout: 120_000,
      });
      const exported = await page.evaluate(async (destination) => {
        const harness = window as unknown as CutoutHarnessWindow;
        const item = [...harness.__mediaStore.getState().mediaItems]
          .reverse()
          .find(
            (candidate) =>
              candidate.metadata?.source === "qcut-local-person-cutout",
          );
        if (!item) throw new Error("QCut person cutout was not added");
        const written = await harness.electronAPI.writeFile(
          destination,
          await item.file.arrayBuffer(),
        );
        const mask = harness.__timelineStore
          .getState()
          .tracks.flatMap((track) => track.elements)
          .flatMap((element) => element.masks ?? [])
          .find((candidate) => candidate.sourceMediaId === item.id);
        return {
          blendImplementation: item.metadata?.blendImplementation,
          didModelRouteFallback: item.metadata?.didModelRouteFallback,
          duration: item.duration,
          hasAlpha: item.metadata?.hasAlpha,
          hasAudio: item.metadata?.hasAudio,
          height: item.height,
          mask,
          modelRoute: item.metadata?.modelRoute,
          outputMediaId: item.id,
          pipelineId: item.metadata?.pipelineId,
          provider: item.metadata?.provider,
          refinementProvider: item.metadata?.refinementProvider,
          requestedModelRoute: item.metadata?.requestedModelRoute,
          size: item.file.size,
          width: item.width,
          written,
        };
      }, outputPath);
      expect(exported).toMatchObject({
        blendImplementation: expectedBlendImplementation,
        didModelRouteFallback: expectedRouteFallback,
        hasAlpha: true,
        height: expectedHeight,
        mask: {
          height: 1,
          sourceMediaId: exported.outputMediaId,
          tracking: { source: "qcut-person-matting" },
          type: "person",
          width: 1,
        },
        modelRoute: expectedActualRoute,
        ...expectedExecutionDescriptor,
        requestedModelRoute: expectedRequestedRoute,
        width: expectedWidth,
        written: true,
      });
      expect(exported.duration).toBeGreaterThan(1.5);
      expect(exported.size).toBeGreaterThan(10_000);
      if (exported.hasAudio === false) {
        await expect(
          page.locator('video[data-video-id$="-mask-audio"]'),
        ).toHaveCount(0);
      }
      await page.evaluate((sourceMediaId) => {
        const harness = window as unknown as CutoutHarnessWindow;
        const element = harness.__timelineStore
          .getState()
          .tracks.flatMap((track) => track.elements)
          .find((candidate) =>
            candidate.masks?.some(
              (mask) => mask.sourceMediaId === sourceMediaId,
            ),
          );
        if (!element) throw new Error("Masked timeline clip is missing");
        harness.__playbackStore.getState().seek(element.startTime + 0.25);
      }, exported.outputMediaId);

      const previewPanel = page.getByTestId("preview-panel");
      const maskVideo = previewPanel.locator(
        'video[data-video-id*="-mask-"]:not([data-video-id$="-mask-audio"])',
      );
      await expect(maskVideo).toHaveCount(1);
      await expect
        .poll(
          () =>
            maskVideo.evaluate(
              (video) => (video as HTMLVideoElement).readyState,
            ),
          { timeout: 30_000 },
        )
        .toBeGreaterThanOrEqual(2);
      await expect
        .poll(() =>
          maskVideo.evaluate((video) => (video as HTMLVideoElement).videoWidth),
        )
        .toBe(expectedWidth);
      let decodedAlphaStats: Record<string, number> | undefined;
      if (alphaQualityProfile) {
        decodedAlphaStats = await maskVideo.evaluate(
          async (element, profile) => {
            const video = element as HTMLVideoElement;
            if (Math.abs(video.currentTime - profile.sampleTime) > 0.02) {
              await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(
                  () => reject(new Error("Timed out seeking alpha sample")),
                  5000,
                );
                video.addEventListener(
                  "seeked",
                  () => {
                    window.clearTimeout(timeout);
                    resolve();
                  },
                  { once: true },
                );
                video.currentTime = profile.sampleTime;
              });
            }
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context) throw new Error("Unable to inspect decoded alpha");
            context.drawImage(video, 0, 0);
            const pixels = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            const means: Record<string, number> = {};
            for (const region of profile.regions) {
              let alphaTotal = 0;
              for (let y = region.y; y < region.y + region.height; y += 1) {
                for (let x = region.x; x < region.x + region.width; x += 1) {
                  alphaTotal += pixels[(y * canvas.width + x) * 4 + 3];
                }
              }
              means[region.name] = alphaTotal / (region.width * region.height);
            }
            return means;
          },
          alphaQualityProfile,
        );
        for (const region of alphaQualityProfile.regions) {
          const mean = decodedAlphaStats[region.name];
          expect(Number.isFinite(mean)).toBe(true);
          if (region.minMean !== undefined) {
            expect(mean).toBeGreaterThan(region.minMean);
          }
          if (region.maxMean !== undefined) {
            expect(mean).toBeLessThan(region.maxMean);
          }
        }
      }
      await properties.screenshot({
        path: join(evidenceDirectory, "02-cutout-completed.png"),
        animations: "disabled",
      });
      await page.evaluate(() => {
        const harness = window as unknown as CutoutHarnessWindow;
        harness.__personCutoutStatusObserver?.disconnect();
        harness.__personCutoutStatusMessages = [];
        const panel = document.querySelector(
          '[data-testid="media-properties"]',
        );
        if (!panel)
          throw new Error("Person-cutout properties panel is missing");
        const recordStatus = () => {
          const text = panel.textContent ?? "";
          if (!text.includes("人物蒙版缓存完整")) return;
          harness.__personCutoutStatusMessages?.push(text);
        };
        const observer = new MutationObserver(recordStatus);
        observer.observe(panel, {
          characterData: true,
          childList: true,
          subtree: true,
        });
        harness.__personCutoutStatusObserver = observer;
        recordStatus();
      });
      const secondRunStartedAt = Date.now();
      await startButton.click();
      await expect(startButton).toBeDisabled();
      await expect(startButton).toBeEnabled({ timeout: 120_000 });
      await expect
        .poll(() =>
          page.evaluate(() => {
            const harness = window as unknown as CutoutHarnessWindow;
            return (
              harness.__personCutoutStatusMessages?.some((message) =>
                message.includes("人物蒙版缓存完整"),
              ) ?? false
            );
          }),
        )
        .toBe(true);
      const cacheHitObserved = true;
      const secondRun = await page.evaluate(() => {
        const harness = window as unknown as CutoutHarnessWindow;
        const items = harness.__mediaStore
          .getState()
          .mediaItems.filter(
            (candidate) =>
              candidate.metadata?.source === "qcut-local-person-cutout",
          );
        const item = items.at(-1);
        if (!item) throw new Error("Cached QCut person cutout was not added");
        return {
          blendImplementation: item.metadata?.blendImplementation,
          count: items.length,
          didModelRouteFallback: item.metadata?.didModelRouteFallback,
          modelRoute: item.metadata?.modelRoute,
          pipelineId: item.metadata?.pipelineId,
          provider: item.metadata?.provider,
          refinementProvider: item.metadata?.refinementProvider,
          requestedModelRoute: item.metadata?.requestedModelRoute,
        };
      });
      expect(secondRun).toMatchObject({
        blendImplementation: expectedBlendImplementation,
        count: 2,
        didModelRouteFallback: expectedSecondRouteFallback,
        modelRoute: expectedActualRoute,
        ...expectedExecutionDescriptor,
        requestedModelRoute: expectedRequestedRoute,
      });
      await page.evaluate(() => {
        const harness = window as unknown as CutoutHarnessWindow;
        harness.__personCutoutStatusObserver?.disconnect();
      });
      await page.evaluate(() => {
        const harness = window as unknown as CutoutHarnessWindow;
        harness.__timelineStore.getState().setSelectedElements([]);
      });
      await previewPanel.screenshot({
        path: join(evidenceDirectory, "03-mask-playing-in-preview.png"),
        animations: "disabled",
      });
      await writeFile(
        join(evidenceDirectory, "e2e-evidence.json"),
        `${JSON.stringify(
          {
            ...exported,
            decodedAlphaStats,
            alphaQualityProfile,
            cacheHitObserved,
            secondRun: {
              ...secondRun,
              elapsedMs: Date.now() - secondRunStartedAt,
            },
            expectedActualRoute,
            expectedRequestedRoute,
            expectedRouteFallback,
            expectedSecondRouteFallback,
            outputPath,
            sourcePath,
            testOutputDirectory: testInfo.outputDir,
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      await electronApp.close();
      if (runtimeLogChunks.length > 0) {
        await writeFile(
          join(evidenceDirectory, "electron-runtime.log"),
          runtimeLogChunks.join(""),
        );
      }
      await rm(profileDirectory, { recursive: true, force: true });
    }
  });
});
