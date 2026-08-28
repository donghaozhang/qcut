import type { ChildProcess } from "node:child_process";
import { createPersonCutoutAbortError } from "./abort.js";
import { createProcessInactivityWatchdog } from "./process-inactivity-watchdog.js";

const PROCESS_ERROR_TAIL_BYTES = 64 * 1024;

export interface ManagedPersonCutoutProcess {
  child: ChildProcess;
  label: string;
}

export function createPersonCutoutRgbaDecoderArguments({
  sourcePath,
}: {
  sourcePath: string;
}) {
  return [
    "-v",
    "error",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-pix_fmt",
    "rgba",
    "-f",
    "rawvideo",
    "pipe:1",
  ];
}

function appendProcessOutputTail({
  current,
  next,
}: {
  current: string;
  next: string;
}) {
  return `${current}${next}`.slice(-PROCESS_ERROR_TAIL_BYTES);
}

export function connectPersonCutoutProcessPipe({
  consumer,
  producer,
}: {
  consumer: ChildProcess;
  producer: ChildProcess;
}) {
  if (!producer.stdout || !consumer.stdin) {
    producer.kill("SIGTERM");
    consumer.kill("SIGTERM");
    throw new Error("无法建立人物蒙版预计算管线");
  }
  producer.stdout.pipe(consumer.stdin);
  for (const stream of [producer.stdout, consumer.stdin]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") consumer.kill("SIGTERM");
    });
  }
}

export function waitForPersonCutoutProcesses({
  inactivityTimeoutMs,
  onStderr,
  processes,
  signal,
}: {
  inactivityTimeoutMs?: number;
  onStderr?: (event: { child: ChildProcess; chunk: Buffer }) => void;
  processes: ManagedPersonCutoutProcess[];
  signal?: AbortSignal;
}) {
  return new Promise<void>((resolve, reject) => {
    const outputTails = new Map<ChildProcess, string>(
      processes.map(({ child }) => [child, ""]),
    );
    let completed = 0;
    let settled = false;
    let inactivityWatchdog: ReturnType<
      typeof createProcessInactivityWatchdog
    > | null = null;
    const terminate = () => {
      for (const { child } of processes) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
        }
      }
      const forceKill = setTimeout(() => {
        for (const { child } of processes) {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }
      }, 1000);
      forceKill.unref();
    };
    const cleanup = () => {
      inactivityWatchdog?.clear();
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminate();
      reject(signal?.aborted ? createPersonCutoutAbortError() : error);
    };
    const abort = () => fail(createPersonCutoutAbortError());
    signal?.addEventListener("abort", abort, { once: true });
    if (inactivityTimeoutMs) {
      inactivityWatchdog = createProcessInactivityWatchdog({
        onTimeout: () =>
          fail(
            new Error(
              `${processes.map(({ label }) => label).join("、")}长时间无响应，已停止并切换稳定模式`,
            ),
          ),
        timeoutMs: inactivityTimeoutMs,
      });
      inactivityWatchdog.reset();
    }

    for (const { child, label } of processes) {
      child.stderr?.on("data", (chunk: Buffer) => {
        if (settled) return;
        inactivityWatchdog?.reset();
        outputTails.set(
          child,
          appendProcessOutputTail({
            current: outputTails.get(child) ?? "",
            next: chunk.toString("utf8"),
          }),
        );
        onStderr?.({ child, chunk });
      });
      child.once("error", (error) => fail(error));
      child.once("close", (code, closeSignal) => {
        if (settled) return;
        if (code !== 0) {
          const details = processes
            .map(
              (candidate) =>
                `${candidate.label}: ${outputTails.get(candidate.child) ?? ""}`,
            )
            .join("\n");
          fail(
            new Error(
              `${label}失败（退出 ${code ?? closeSignal ?? "unknown"}）：\n${details}`,
            ),
          );
          return;
        }
        completed += 1;
        if (completed !== processes.length) return;
        settled = true;
        cleanup();
        resolve();
      });
    }
  });
}
