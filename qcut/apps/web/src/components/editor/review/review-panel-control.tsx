import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
	CheckCircle2,
	ClipboardCopy,
	Cloud,
	Clock3,
	Link2,
	Link2Off,
	MessageSquareMore,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
	decodeReviewPackage,
	encodeReviewPackage,
	type PortableReviewComment,
} from "@/lib/review/review-share";
import {
	createCloudReview,
	extractCloudReviewToken,
	loadCloudReview,
	revokeCloudReview,
	syncCloudReview,
} from "@/lib/review/review-cloud-client";
import {
	clearStoredCloudReview,
	loadStoredCloudReview,
	storeCloudReview,
	type StoredCloudReviewState,
} from "@/lib/review/review-cloud-state";
import { resolveReviewProjectDuration } from "@/lib/review/review-project";
import { SITE_URL } from "@/constants/site";
import { formatTimeCode } from "@/lib/time";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useLicenseStore } from "@/stores/license-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useReviewStore, type ReviewComment } from "@/stores/review-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { MAX_REVIEW_COMMENTS } from "@qcut/editor-core/collaboration";

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

function portableComment({
	comment,
}: {
	comment: ReviewComment;
}): PortableReviewComment {
	return {
		author: comment.author,
		createdAt: comment.createdAt,
		id: comment.id,
		resolved: comment.resolved,
		text: comment.text,
		time: comment.time,
		updatedAt: comment.updatedAt,
	};
}

export function ReviewPanelControl() {
	const activeProject = useProjectStore((state) => state.activeProject);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const timelineDuration = useTimelineStore((state) =>
		state.getTotalDuration()
	);
	const author = useLicenseStore(
		(state) => state.license?.user?.name ?? "Editor"
	);
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const comments = useReviewStore((state) => state.comments);
	const loadProject = useReviewStore((state) => state.loadProject);
	const addComment = useReviewStore((state) => state.addComment);
	const mergePackage = useReviewStore((state) => state.mergePackage);
	const removeComment = useReviewStore((state) => state.removeComment);
	const toggleResolved = useReviewStore((state) => state.toggleResolved);
	const [commentText, setCommentText] = useState("");
	const [packageText, setPackageText] = useState("");
	const [cloudState, setCloudState] = useState<StoredCloudReviewState | null>(
		null
	);
	const [cloudMediaUrl, setCloudMediaUrl] = useState<string>();
	const [cloudProjectDuration, setCloudProjectDuration] = useState(0);
	const [isCloudBusy, setIsCloudBusy] = useState(false);
	const [cloudSyncError, setCloudSyncError] = useState<string>();
	const cloudSyncPromise = useRef<Promise<StoredCloudReviewState> | null>(null);
	const cloudToken = useRef<string | null>(null);
	const lastSyncedFingerprint = useRef("");
	const openComments = useMemo(
		() => comments.filter((comment) => !comment.resolved).length,
		[comments]
	);

	useEffect(() => {
		if (!activeProject?.id) return;
		loadProject({ projectId: activeProject.id });
		const stored = loadStoredCloudReview({ projectId: activeProject.id });
		cloudToken.current = stored?.token ?? null;
		setCloudState(stored);
		setCloudMediaUrl(undefined);
		setCloudProjectDuration(0);
		setCloudSyncError(undefined);
		lastSyncedFingerprint.current = "";
		if (!stored) return;
		const controller = new AbortController();
		void loadCloudReview({ token: stored.token, signal: controller.signal })
			.then((snapshot) => {
				if (cloudToken.current !== stored.token) return;
				mergePackage({ reviewPackage: snapshot.package });
				setCloudMediaUrl(snapshot.package.project.mediaUrl);
				setCloudProjectDuration(snapshot.package.project.duration);
				const nextState = { ...stored, revision: snapshot.revision };
				setCloudState((current) => {
					if (
						!current ||
						current.token !== stored.token ||
						current.revision >= nextState.revision
					) {
						return current;
					}
					storeCloudReview({ state: nextState });
					return nextState;
				});
			})
			.catch((error) => {
				if (error instanceof DOMException && error.name === "AbortError")
					return;
				setCloudSyncError(
					error instanceof Error ? error.message : "审片链接读取失败"
				);
			});
		return () => controller.abort();
	}, [activeProject?.id, loadProject, mergePackage]);

	const reviewMediaUrl = useMemo(() => {
		for (const item of mediaItems) {
			for (const value of [item.originalUrl, item.url]) {
				if (typeof value === "string" && /^https:\/\//i.test(value))
					return value;
			}
		}
		return undefined;
	}, [mediaItems]);

	const currentReviewPackage = useMemo(() => {
		if (!activeProject) return null;
		return {
			comments: comments.map((comment) => portableComment({ comment })),
			createdAt: Date.now(),
			project: {
				duration: resolveReviewProjectDuration({
					remoteDuration: cloudProjectDuration,
					timelineDuration,
				}),
				id: activeProject.id,
				mediaUrl: reviewMediaUrl ?? cloudMediaUrl,
				name: activeProject.name,
			},
			version: 1 as const,
		};
	}, [
		activeProject,
		cloudMediaUrl,
		cloudProjectDuration,
		comments,
		reviewMediaUrl,
		timelineDuration,
	]);

	const commentsFingerprint = useMemo(
		() => JSON.stringify(currentReviewPackage?.comments ?? []),
		[currentReviewPackage?.comments]
	);

	const syncExistingCloudReview = useCallback(
		async ({
			state,
			reviewPackage,
			silent,
		}: {
			state: StoredCloudReviewState;
			reviewPackage: NonNullable<typeof currentReviewPackage>;
			silent: boolean;
		}) => {
			let activeOperation = cloudSyncPromise.current;
			if (!activeOperation) {
				setIsCloudBusy(true);
				activeOperation = (async () => {
					const snapshot = await syncCloudReview({
						token: state.token,
						baseRevision: state.revision,
						reviewPackage,
					});
					mergePackage({ reviewPackage: snapshot.package });
					const nextState = { ...state, revision: snapshot.revision };
					storeCloudReview({ state: nextState });
					cloudToken.current = nextState.token;
					setCloudState(nextState);
					lastSyncedFingerprint.current = JSON.stringify(
						snapshot.package.comments
					);
					setCloudSyncError(undefined);
					return nextState;
				})();
				cloudSyncPromise.current = activeOperation;
			}
			try {
				const nextState = await activeOperation;
				if (!silent) toast.success("审片评论已同步");
				return nextState;
			} catch (error) {
				setCloudSyncError(
					error instanceof Error ? error.message : "审片同步失败"
				);
				if (!silent) throw error;
				return state;
			} finally {
				if (cloudSyncPromise.current === activeOperation) {
					cloudSyncPromise.current = null;
					setIsCloudBusy(false);
				}
			}
		},
		[mergePackage]
	);

	useEffect(() => {
		if (
			!cloudState ||
			!currentReviewPackage ||
			commentsFingerprint === lastSyncedFingerprint.current
		) {
			return;
		}
		const timeout = window.setTimeout(() => {
			void syncExistingCloudReview({
				state: cloudState,
				reviewPackage: currentReviewPackage,
				silent: true,
			});
		}, 1_200);
		return () => window.clearTimeout(timeout);
	}, [
		cloudState,
		commentsFingerprint,
		currentReviewPackage,
		syncExistingCloudReview,
	]);

	const copyPackage = async () => {
		if (!currentReviewPackage) return;
		const token = encodeReviewPackage({
			reviewPackage: currentReviewPackage,
		});
		try {
			await navigator.clipboard.writeText(token);
			toast.success("Review package copied");
		} catch {
			setPackageText(token);
			toast.info("Review package is ready in the import field");
		}
	};

	const copyCloudLink = async () => {
		if (!activeProject || !currentReviewPackage) return;
		setIsCloudBusy(true);
		try {
			let nextState = cloudState;
			if (nextState) {
				nextState = await syncExistingCloudReview({
					state: nextState,
					reviewPackage: currentReviewPackage,
					silent: false,
				});
			} else {
				const share = await createCloudReview({
					reviewPackage: currentReviewPackage,
				});
				nextState = {
					projectId: activeProject.id,
					revision: share.revision,
					token: share.token,
					url: share.url,
				};
				storeCloudReview({ state: nextState });
				cloudToken.current = nextState.token;
				setCloudState(nextState);
				lastSyncedFingerprint.current = commentsFingerprint;
				setCloudMediaUrl(share.package.project.mediaUrl);
				setCloudProjectDuration(share.package.project.duration);
				setCloudSyncError(undefined);
			}
			await navigator.clipboard.writeText(nextState.url);
			toast.success("审片链接已复制");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "创建审片链接失败");
		} finally {
			setIsCloudBusy(false);
		}
	};

	const revokeLink = async () => {
		if (!activeProject || !cloudState) return;
		setIsCloudBusy(true);
		try {
			await revokeCloudReview({ token: cloudState.token });
			clearStoredCloudReview({ projectId: activeProject.id });
			cloudToken.current = null;
			setCloudState(null);
			setCloudMediaUrl(undefined);
			setCloudProjectDuration(0);
			setCloudSyncError(undefined);
			lastSyncedFingerprint.current = "";
			toast.success("审片链接已撤销");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "撤销审片链接失败");
		} finally {
			setIsCloudBusy(false);
		}
	};

	const importPackage = async () => {
		const reviewPackage = decodeReviewPackage({ token: packageText });
		if (reviewPackage) {
			const merged = mergePackage({ reviewPackage });
			setPackageText("");
			toast.success(
				merged > 0
					? `Merged ${merged} review comments`
					: "Review is already current"
			);
			return;
		}
		const token = extractCloudReviewToken({ value: packageText });
		if (!token) {
			toast.error("Invalid review link or package");
			return;
		}
		setIsCloudBusy(true);
		try {
			const snapshot = await loadCloudReview({ token });
			const merged = mergePackage({ reviewPackage: snapshot.package });
			if (activeProject?.id === snapshot.package.project.id) {
				const nextState = {
					projectId: activeProject.id,
					revision: snapshot.revision,
					token,
					url: `${SITE_URL}/#/review/${encodeURIComponent(token)}`,
				};
				storeCloudReview({ state: nextState });
				cloudToken.current = nextState.token;
				setCloudState(nextState);
				setCloudMediaUrl(snapshot.package.project.mediaUrl);
				setCloudProjectDuration(snapshot.package.project.duration);
				setCloudSyncError(undefined);
			}
			setPackageText("");
			toast.success(
				merged > 0 ? `Merged ${merged} review comments` : "Review is current"
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "审片链接读取失败");
		} finally {
			setIsCloudBusy(false);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="relative h-7 gap-1.5 px-2 text-xs"
					aria-label={`Open review comments, ${openComments} open`}
					title="Review comments"
					data-testid="review-panel-trigger"
				>
					<MessageSquareMore className="h-3.5 w-3.5">
						<title>Review comments</title>
					</MessageSquareMore>
					<span>审片</span>
					{openComments > 0 ? (
						<span className="grid min-w-4 place-items-center bg-destructive px-1 text-[9px] leading-4 text-destructive-foreground">
							{openComments > 99 ? "99+" : openComments}
						</span>
					) : null}
				</Button>
			</DialogTrigger>
			<DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>审片评论</DialogTitle>
					<DialogDescription>
						评论按时间码保存在当前工程，并可通过审片链接实时合并。
					</DialogDescription>
				</DialogHeader>

				<form
					className="border-b border-border pb-3"
					onSubmit={(event) => {
						event.preventDefault();
						const id = addComment({
							author,
							text: commentText,
							time: currentTime,
						});
						if (!id) {
							if (comments.length >= MAX_REVIEW_COMMENTS) {
								toast.error(`每个工程最多 ${MAX_REVIEW_COMMENTS} 条审片评论`);
							}
							return;
						}
						setCommentText("");
					}}
				>
					<div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>{author}</span>
						<code>
							{formatTimeCode(
								currentTime,
								"HH:MM:SS:FF",
								activeProject?.fps ?? 30
							)}
						</code>
					</div>
					<Textarea
						value={commentText}
						onChange={(event) => setCommentText(event.target.value)}
						placeholder="输入这个时间点的修改意见"
						maxLength={2000}
						className="min-h-20 resize-none"
						aria-label="Review comment"
					/>
					<div className="mt-2 flex justify-end">
						<Button
							type="submit"
							size="sm"
							disabled={
								!commentText.trim() || comments.length >= MAX_REVIEW_COMMENTS
							}
						>
							添加评论
						</Button>
					</div>
				</form>

				<div
					className="min-h-0 flex-1 divide-y divide-border overflow-y-auto"
					data-testid="review-comment-list"
				>
					{comments.length === 0 ? (
						<div className="py-10 text-center text-sm text-muted-foreground">
							暂无审片评论
						</div>
					) : (
						comments.map((comment) => {
							const seekToComment = () =>
								usePlaybackStore.getState().seek(comment.time);
							const resolveComment = () =>
								toggleResolved({ commentId: comment.id });
							const deleteComment = () =>
								removeComment({ commentId: comment.id });
							return (
								<div
									key={comment.id}
									className={`grid grid-cols-[auto_1fr_auto_auto] items-start gap-2 py-3 ${comment.resolved ? "opacity-55" : ""}`}
									data-testid={`review-comment-${comment.id}`}
								>
									<Button
										type="button"
										variant="text"
										size="sm"
										className="h-7 gap-1 px-1.5 font-mono text-[10px]"
										onClick={seekToComment}
										onKeyDown={(event) =>
											activateOnKeyboard({ action: seekToComment, event })
										}
										title="Jump to comment time"
									>
										<Clock3 className="h-3 w-3">
											<title>Jump to comment time</title>
										</Clock3>
										{formatTimeCode(
											comment.time,
											"HH:MM:SS:FF",
											activeProject?.fps ?? 30
										)}
									</Button>
									<div className="min-w-0">
										<p className={comment.resolved ? "line-through" : ""}>
											{comment.text}
										</p>
										<p className="mt-1 text-[10px] text-muted-foreground">
											{comment.author}
										</p>
									</div>
									<Button
										type="button"
										variant="text"
										size="icon"
										className="h-7 w-7"
										onClick={resolveComment}
										onKeyDown={(event) =>
											activateOnKeyboard({ action: resolveComment, event })
										}
										aria-label={
											comment.resolved ? "Reopen comment" : "Resolve comment"
										}
										title={
											comment.resolved ? "Reopen comment" : "Resolve comment"
										}
									>
										{comment.resolved ? (
											<RotateCcw className="h-3.5 w-3.5">
												<title>Reopen comment</title>
											</RotateCcw>
										) : (
											<CheckCircle2 className="h-3.5 w-3.5">
												<title>Resolve comment</title>
											</CheckCircle2>
										)}
									</Button>
									<Button
										type="button"
										variant="text"
										size="icon"
										className="h-7 w-7 text-destructive"
										onClick={deleteComment}
										onKeyDown={(event) =>
											activateOnKeyboard({ action: deleteComment, event })
										}
										aria-label="Delete review comment"
										title="Delete review comment"
									>
										<Trash2 className="h-3.5 w-3.5">
											<title>Delete review comment</title>
										</Trash2>
									</Button>
								</div>
							);
						})
					)}
				</div>

				<div className="border-t border-border pt-3">
					<div className="mb-2 flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isCloudBusy}
							className="gap-1.5"
							onClick={() => void copyCloudLink()}
							onKeyDown={(event) =>
								activateOnKeyboard({
									action: () => void copyCloudLink(),
									event,
								})
							}
							data-testid="review-cloud-link"
						>
							<Link2 className="h-3.5 w-3.5">
								<title>Copy cloud review link</title>
							</Link2>
							{cloudState ? "同步并复制链接" : "创建审片链接"}
						</Button>
						{cloudState ? (
							<>
								<span
									className={`flex min-w-0 flex-1 items-center gap-1 truncate text-[10px] ${cloudSyncError ? "text-destructive" : "text-muted-foreground"}`}
									title={cloudSyncError ?? cloudState.url}
									data-testid={
										cloudSyncError
											? "review-cloud-sync-error"
											: "review-cloud-version"
									}
								>
									<Cloud className="size-3 shrink-0">
										<title>Cloud review connected</title>
									</Cloud>
									{cloudSyncError ? "同步失败" : `v${cloudState.revision}`}
								</span>
								<Button
									type="button"
									variant="text"
									size="icon"
									className="size-8 text-destructive"
									disabled={isCloudBusy}
									onClick={() => void revokeLink()}
									onKeyDown={(event) =>
										activateOnKeyboard({
											action: () => void revokeLink(),
											event,
										})
									}
									aria-label="Revoke review link"
									title="Revoke review link"
								>
									<Link2Off className="size-3.5">
										<title>Revoke review link</title>
									</Link2Off>
								</Button>
							</>
						) : cloudSyncError ? (
							<span
								className="min-w-0 flex-1 truncate text-[10px] text-destructive"
								title={cloudSyncError}
								data-testid="review-cloud-sync-error"
							>
								同步失败
							</span>
						) : null}
					</div>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="shrink-0 gap-1.5"
							onClick={() => void copyPackage()}
							onKeyDown={(event) =>
								activateOnKeyboard({
									action: () => void copyPackage(),
									event,
								})
							}
							title="Copy portable review package"
						>
							<ClipboardCopy className="h-3.5 w-3.5">
								<title>Copy portable review package</title>
							</ClipboardCopy>
							复制审片包
						</Button>
						<Textarea
							value={packageText}
							onChange={(event) => setPackageText(event.target.value)}
							placeholder="粘贴审片链接或 qcut-review 审片包"
							className="min-h-9 flex-1 resize-none py-2 text-[10px]"
							aria-label="Review package import"
						/>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							disabled={!packageText.trim()}
							onClick={() => void importPackage()}
							onKeyDown={(event) =>
								activateOnKeyboard({
									action: () => void importPackage(),
									event,
								})
							}
						>
							合并
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
