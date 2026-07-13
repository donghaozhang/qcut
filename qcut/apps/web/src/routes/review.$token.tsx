import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
	CheckCircle2,
	Clock3,
	LoaderCircle,
	MessageSquareText,
	RotateCcw,
	Send,
	Trash2,
} from "lucide-react";
import type {
	PortableReviewComment,
	ReviewPackage,
} from "@qcut/editor-core/collaboration";
import { MAX_REVIEW_COMMENTS } from "@qcut/editor-core/collaboration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
	loadCloudReview,
	syncCloudReview,
	type CloudReviewSnapshot,
} from "@/lib/review/review-cloud-client";
import { formatTimeCode } from "@/lib/time";

export const Route = createFileRoute("/review/$token")({
	component: PublicReviewPage,
});

const REVIEWER_NAME_KEY = "qcut-reviewer-name";

function storedReviewerName() {
	try {
		return localStorage.getItem(REVIEWER_NAME_KEY) ?? "Reviewer";
	} catch {
		return "Reviewer";
	}
}

function activateOnKeyboard({
	action,
	event,
}: {
	action: () => void;
	event: KeyboardEvent<HTMLButtonElement>;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	action();
}

function PublicReviewPage() {
	const { token } = Route.useParams();
	const videoRef = useRef<HTMLVideoElement>(null);
	const [snapshot, setSnapshot] = useState<CloudReviewSnapshot | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [loadError, setLoadError] = useState("");
	const [author, setAuthor] = useState(storedReviewerName);
	const [text, setText] = useState("");
	const [currentTime, setCurrentTime] = useState(0);

	useEffect(() => {
		const controller = new AbortController();
		setIsLoading(true);
		void loadCloudReview({ token, signal: controller.signal })
			.then((nextSnapshot) => {
				setSnapshot(nextSnapshot);
				setLoadError("");
			})
			.catch((error) => {
				if (error instanceof DOMException && error.name === "AbortError")
					return;
				setLoadError(
					error instanceof Error ? error.message : "Review link not found"
				);
			})
			.finally(() => setIsLoading(false));
		return () => controller.abort();
	}, [token]);

	const saveComments = async ({
		comments,
	}: {
		comments: PortableReviewComment[];
	}) => {
		if (!snapshot || isSaving) return;
		const previous = snapshot;
		const reviewPackage: ReviewPackage = {
			...snapshot.package,
			comments,
			createdAt: Date.now(),
		};
		setSnapshot({ ...snapshot, package: reviewPackage });
		setIsSaving(true);
		try {
			const saved = await syncCloudReview({
				token,
				baseRevision: snapshot.revision,
				reviewPackage,
			});
			setSnapshot(saved);
		} catch (error) {
			setSnapshot(previous);
			toast.error(
				error instanceof Error ? error.message : "Review sync failed"
			);
		} finally {
			setIsSaving(false);
		}
	};

	const seek = ({ time }: { time: number }) => {
		const bounded = Math.max(
			0,
			Math.min(snapshot?.package.project.duration ?? 0, time)
		);
		setCurrentTime(bounded);
		if (videoRef.current) videoRef.current.currentTime = bounded;
	};

	if (isLoading) {
		return (
			<div className="grid min-h-screen place-items-center bg-background">
				<LoaderCircle className="size-6 animate-spin text-muted-foreground">
					<title>Loading review</title>
				</LoaderCircle>
			</div>
		);
	}

	if (!snapshot || loadError) {
		return (
			<div className="grid min-h-screen place-items-center bg-background p-6">
				<div className="text-center">
					<MessageSquareText className="mx-auto mb-3 size-8 text-muted-foreground">
						<title>Review unavailable</title>
					</MessageSquareText>
					<h1 className="text-lg font-medium">Review unavailable</h1>
					<p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
				</div>
			</div>
		);
	}

	const { package: reviewPackage } = snapshot;
	const duration = Math.max(0, reviewPackage.project.duration);
	const fps = 30;

	return (
		<div
			className="min-h-screen bg-background text-foreground"
			data-testid="public-review-page"
		>
			<header className="flex h-12 items-center justify-between border-b border-border px-4">
				<div className="min-w-0">
					<span className="mr-3 text-sm font-semibold">QCut Review</span>
					<span className="truncate text-xs text-muted-foreground">
						{reviewPackage.project.name}
					</span>
				</div>
				<div
					className="flex items-center gap-1 text-[11px] text-muted-foreground"
					data-testid="public-review-version"
				>
					{isSaving ? (
						<LoaderCircle className="size-3 animate-spin">
							<title>Saving review</title>
						</LoaderCircle>
					) : (
						<CheckCircle2 className="size-3 text-emerald-500">
							<title>Review saved</title>
						</CheckCircle2>
					)}
					v{snapshot.revision}
				</div>
			</header>

			<main className="grid min-h-[calc(100vh-3rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
				<section className="flex min-h-[55vh] flex-col bg-black">
					<div className="grid min-h-0 flex-1 place-items-center overflow-hidden">
						{reviewPackage.project.mediaUrl ? (
							<video
								ref={videoRef}
								src={reviewPackage.project.mediaUrl}
								controls
								className="max-h-[calc(100vh-8rem)] max-w-full"
								data-testid="public-review-video"
								onTimeUpdate={(event) =>
									setCurrentTime(event.currentTarget.currentTime)
								}
							>
								<track kind="captions" />
							</video>
						) : (
							<div className="text-center text-white/45">
								<MessageSquareText className="mx-auto mb-3 size-10">
									<title>Timecode review</title>
								</MessageSquareText>
								<code className="text-lg text-white/80">
									{formatTimeCode(currentTime, "HH:MM:SS:FF", fps)}
								</code>
							</div>
						)}
					</div>
					<div className="border-t border-white/10 px-4 py-3">
						<input
							type="range"
							min={0}
							max={duration || 1}
							step={1 / fps}
							value={Math.min(currentTime, duration || 1)}
							onChange={(event) => seek({ time: Number(event.target.value) })}
							className="w-full accent-cyan-400"
							aria-label="Review time"
						/>
						<div className="mt-1 flex justify-between font-mono text-[10px] text-white/55">
							<span data-testid="public-review-current-time">
								{formatTimeCode(currentTime, "HH:MM:SS:FF", fps)}
							</span>
							<span data-testid="public-review-duration">
								{formatTimeCode(duration, "HH:MM:SS:FF", fps)}
							</span>
						</div>
					</div>
				</section>

				<aside className="flex min-h-0 flex-col border-t border-border bg-background lg:border-l lg:border-t-0">
					<form
						className="space-y-2 border-b border-border p-4"
						onSubmit={(event) => {
							event.preventDefault();
							const normalizedText = text.trim();
							if (!normalizedText) return;
							if (reviewPackage.comments.length >= MAX_REVIEW_COMMENTS) {
								toast.error(`最多支持 ${MAX_REVIEW_COMMENTS} 条审片评论`);
								return;
							}
							const now = Date.now();
							const comment: PortableReviewComment = {
								author: author.trim() || "Reviewer",
								createdAt: now,
								id: crypto.randomUUID(),
								resolved: false,
								text: normalizedText.slice(0, 2_000),
								time: currentTime,
								updatedAt: now,
							};
							try {
								localStorage.setItem(REVIEWER_NAME_KEY, comment.author);
							} catch {
								// The comment still saves when browser storage is unavailable.
							}
							setText("");
							void saveComments({
								comments: [...reviewPackage.comments, comment].sort(
									(left, right) => left.time - right.time
								),
							});
						}}
					>
						<div className="grid grid-cols-[1fr_auto] gap-2">
							<Input
								value={author}
								onChange={(event) => setAuthor(event.target.value)}
								maxLength={160}
								aria-label="Reviewer name"
								className="h-8 text-xs"
							/>
							<code className="self-center text-[10px] text-muted-foreground">
								{formatTimeCode(currentTime, "HH:MM:SS:FF", fps)}
							</code>
						</div>
						<Textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							placeholder="输入修改意见"
							maxLength={2_000}
							className="min-h-20 resize-none"
							aria-label="Review comment"
						/>
						<Button
							type="submit"
							size="sm"
							disabled={
								!text.trim() ||
								isSaving ||
								reviewPackage.comments.length >= MAX_REVIEW_COMMENTS
							}
							className="w-full gap-1.5"
						>
							<Send className="size-3.5">
								<title>Add review comment</title>
							</Send>
							添加评论
						</Button>
					</form>

					<div
						className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4"
						data-testid="public-review-comments"
					>
						{reviewPackage.comments.length === 0 ? (
							<div className="py-12 text-center text-sm text-muted-foreground">
								暂无审片评论
							</div>
						) : (
							reviewPackage.comments.map((comment) => (
								<div
									key={comment.id}
									className={comment.resolved ? "py-3 opacity-55" : "py-3"}
								>
									<div className="mb-1 flex items-center justify-between gap-2">
										<Button
											type="button"
											variant="text"
											size="sm"
											className="h-6 gap-1 px-0 font-mono text-[10px]"
											onClick={() => seek({ time: comment.time })}
											onKeyDown={(event) =>
												activateOnKeyboard({
													action: () => seek({ time: comment.time }),
													event,
												})
											}
										>
											<Clock3 className="size-3">
												<title>Jump to comment time</title>
											</Clock3>
											{formatTimeCode(comment.time, "HH:MM:SS:FF", fps)}
										</Button>
										<div className="flex gap-1">
											<Button
												type="button"
												variant="text"
												size="icon"
												className="size-6"
												disabled={isSaving}
												onClick={() =>
													void saveComments({
														comments: reviewPackage.comments.map((candidate) =>
															candidate.id === comment.id
																? {
																		...candidate,
																		resolved: !candidate.resolved,
																		updatedAt: Date.now(),
																	}
																: candidate
														),
													})
												}
												onKeyDown={() => undefined}
												aria-label={
													comment.resolved
														? "Reopen comment"
														: "Resolve comment"
												}
												title={
													comment.resolved
														? "Reopen comment"
														: "Resolve comment"
												}
											>
												{comment.resolved ? (
													<RotateCcw className="size-3">
														<title>Reopen comment</title>
													</RotateCcw>
												) : (
													<CheckCircle2 className="size-3">
														<title>Resolve comment</title>
													</CheckCircle2>
												)}
											</Button>
											<Button
												type="button"
												variant="text"
												size="icon"
												className="size-6 text-destructive"
												disabled={isSaving}
												onClick={() =>
													void saveComments({
														comments: reviewPackage.comments.filter(
															(candidate) => candidate.id !== comment.id
														),
													})
												}
												onKeyDown={() => undefined}
												aria-label="Delete comment"
												title="Delete comment"
											>
												<Trash2 className="size-3">
													<title>Delete comment</title>
												</Trash2>
											</Button>
										</div>
									</div>
									<p className={comment.resolved ? "line-through" : ""}>
										{comment.text}
									</p>
									<p className="mt-1 text-[10px] text-muted-foreground">
										{comment.author}
									</p>
								</div>
							))
						)}
					</div>
				</aside>
			</main>
		</div>
	);
}
