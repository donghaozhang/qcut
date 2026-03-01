import type { RenderJob, RenderJobStatus } from "@/lib/remotion/types";
import { generateUUID } from "@/lib/utils";
import type { SetFn } from "./types";

/** Creates actions for managing the Remotion render job queue. */
export function createRenderQueueActions(set: SetFn) {
	return {
		addRenderJob: (job: Omit<RenderJob, "id" | "createdAt">) => {
			const id = generateUUID();
			const newJob: RenderJob = {
				...job,
				id,
				createdAt: Date.now(),
			};

			set((state) => ({
				renderQueue: [...state.renderQueue, newJob].sort(
					(a, b) => b.priority - a.priority
				),
			}));

			return id;
		},

		updateRenderJobStatus: (
			jobId: string,
			status: RenderJobStatus,
			progress?: number
		) => {
			set((state) => ({
				renderQueue: state.renderQueue.map((job) =>
					job.id === jobId
						? {
								...job,
								status,
								progress: progress ?? job.progress,
								...(status === "rendering" && !job.startedAt
									? { startedAt: Date.now() }
									: {}),
								...(status === "complete" || status === "error"
									? { completedAt: Date.now() }
									: {}),
							}
						: job
				),
			}));
		},

		cancelRenderJob: (jobId: string) => {
			set((state) => ({
				renderQueue: state.renderQueue.map((job) =>
					job.id === jobId
						? {
								...job,
								status: "cancelled" as RenderJobStatus,
								completedAt: Date.now(),
							}
						: job
				),
			}));
		},

		clearCompletedJobs: () => {
			set((state) => ({
				renderQueue: state.renderQueue.filter(
					(job) =>
						job.status !== "complete" &&
						job.status !== "error" &&
						job.status !== "cancelled"
				),
			}));
		},
	};
}
