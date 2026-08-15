import { useMemo, useState } from "react";
import {
	Box,
	History,
	Loader2,
	LogIn,
	LogOut,
	RefreshCw,
	Repeat2,
	Search,
	Sparkles,
	Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
	JianyingTextAnimationLabSummary,
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
} from "@/types/electron";

const SLOT_OPTIONS = [
	{ slot: "entrance", label: "入场", icon: LogIn },
	{ slot: "exit", label: "出场", icon: LogOut },
	{ slot: "loop", label: "循环", icon: Repeat2 },
] as const satisfies readonly {
	slot: JianyingTextAnimationSlot;
	label: string;
	icon: typeof LogIn;
}[];

function animationTitle({
	animation,
}: {
	animation: JianyingTextAnimationLabSummary;
}) {
	return animation.title ?? `本机动画 ${animation.resourceId.slice(-6)}`;
}

function referencesMatch({
	animation,
	reference,
}: {
	animation: JianyingTextAnimationLabSummary;
	reference: JianyingTextAnimationReferences[JianyingTextAnimationSlot];
}) {
	return (
		reference?.resourceId === animation.resourceId &&
		reference.packageHash === animation.packageHash
	);
}

function isActivationKey({ event }: { event: React.KeyboardEvent }) {
	return event.key === "Enter" || event.key === " ";
}

export function JianyingTextAnimationPicker({
	animations,
	checking,
	error,
	selected,
	onChange,
	onRefresh,
}: {
	animations: JianyingTextAnimationLabSummary[];
	checking: boolean;
	error: string;
	selected: JianyingTextAnimationReferences;
	onChange: ({
		animation,
		slot,
	}: {
		animation?: JianyingTextAnimationLabSummary;
		slot: JianyingTextAnimationSlot;
	}) => void;
	onRefresh: () => void;
}) {
	const [activeSlot, setActiveSlot] =
		useState<JianyingTextAnimationSlot>("loop");
	const [query, setQuery] = useState("");
	const counts = useMemo(
		() =>
			Object.fromEntries(
				SLOT_OPTIONS.map(({ slot }) => [
					slot,
					animations.filter((animation) => animation.slot === slot).length,
				])
			) as Record<JianyingTextAnimationSlot, number>,
		[animations]
	);
	const visibleAnimations = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return animations.filter((animation) => {
			if (animation.slot !== activeSlot) return false;
			if (!normalizedQuery) return true;
			return [animationTitle({ animation }), animation.resourceId]
				.join(" ")
				.toLocaleLowerCase()
				.includes(normalizedQuery);
		});
	}, [activeSlot, animations, query]);
	const selectedReference = selected[activeSlot];

	return (
		<section
			className="mt-3 border-white/10 border-t pt-2"
			data-testid="jianying-text-animation-picker"
		>
			<div className="flex items-center gap-2">
				<div className="flex h-7 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/20">
					{SLOT_OPTIONS.map(({ icon: Icon, label, slot }) => (
						<button
							key={slot}
							type="button"
							aria-pressed={activeSlot === slot}
							className={cn(
								"flex min-w-16 items-center justify-center gap-1 border-white/10 border-r px-2 text-[11px] last:border-r-0",
								activeSlot === slot
									? "bg-cyan-400/15 text-cyan-200"
									: "text-muted-foreground hover:bg-white/[0.06]"
							)}
							onClick={() => setActiveSlot(slot)}
							onKeyDown={(event) => {
								if (!isActivationKey({ event })) return;
								event.preventDefault();
								setActiveSlot(slot);
							}}
						>
							<Icon aria-hidden="true" className="size-3" />
							<span>{label}</span>
							<span className="text-[9px] text-muted-foreground">
								{counts[slot]}
							</span>
						</button>
					))}
				</div>
				<label className="relative min-w-0 flex-1">
					<Search className="-translate-y-1/2 pointer-events-none absolute left-2 top-1/2 size-3 text-muted-foreground" />
					<Input
						aria-label="搜索剪映文字动画"
						className="h-7 bg-black/20 pl-7 text-[11px]"
						placeholder="搜索动画"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7"
					aria-label="刷新本机文字动画缓存"
					disabled={checking}
					onClick={onRefresh}
					onKeyDown={(event) => {
						if (!isActivationKey({ event })) return;
						event.preventDefault();
						onRefresh();
					}}
				>
					<RefreshCw
						aria-hidden="true"
						className={cn("size-3.5", checking && "animate-spin")}
					/>
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7"
					aria-label={`清除${SLOT_OPTIONS.find(({ slot }) => slot === activeSlot)?.label ?? ""}动画`}
					disabled={!selectedReference}
					onClick={() => onChange({ slot: activeSlot })}
					onKeyDown={(event) => {
						if (!isActivationKey({ event })) return;
						event.preventDefault();
						onChange({ slot: activeSlot });
					}}
				>
					<Trash2 aria-hidden="true" className="size-3.5" />
				</Button>
			</div>
			{error ? (
				<div className="flex h-20 items-center justify-center text-xs text-amber-300">
					{error}
				</div>
			) : null}
			{!error && checking && animations.length === 0 ? (
				<div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
					<Loader2 className="mr-2 size-4 animate-spin" />
					正在读取本机文字动画
				</div>
			) : null}
			{!error && (!checking || animations.length > 0) ? (
				<div className="mt-2 grid max-h-36 grid-cols-3 gap-1.5 overflow-y-auto pr-1 lg:grid-cols-4">
					{visibleAnimations.map((animation) => {
						const title = animationTitle({ animation });
						const isSelected = referencesMatch({
							animation,
							reference: selectedReference,
						});
						return (
							<button
								key={animation.animationId}
								type="button"
								aria-label={`应用${SLOT_OPTIONS.find(({ slot }) => slot === activeSlot)?.label ?? ""}动画 ${title}`}
								aria-pressed={isSelected}
								className={cn(
									"h-16 min-w-0 rounded-md border bg-[#292929] p-2 text-left",
									isSelected
										? "border-cyan-400 bg-cyan-400/10"
										: "border-white/5 hover:border-white/20 hover:bg-[#303030]"
								)}
								onClick={() => onChange({ animation, slot: activeSlot })}
								onKeyDown={(event) => {
									if (!isActivationKey({ event })) return;
									event.preventDefault();
									onChange({ animation, slot: activeSlot });
								}}
							>
								<div className="flex min-w-0 items-center justify-between gap-2">
									<span className="truncate text-[11px] text-foreground">
										{title}
									</span>
									<span className="shrink-0 text-[9px] text-muted-foreground">
										{animation.duration.toFixed(1)}s
									</span>
								</div>
								<div className="mt-2 flex h-4 items-center gap-1 text-[9px] text-muted-foreground">
									{animation.capabilities.threeDimensional ? (
										<span className="flex items-center gap-0.5">
											<Box aria-hidden="true" className="size-3" /> 3D
										</span>
									) : null}
									{animation.capabilities.shaderComponents ? (
										<span className="flex items-center gap-0.5">
											<Sparkles aria-hidden="true" className="size-3" /> Shader
										</span>
									) : null}
									{animation.capabilities.feedbackComponents ? (
										<span className="flex items-center gap-0.5">
											<History aria-hidden="true" className="size-3" /> 反馈
										</span>
									) : null}
								</div>
							</button>
						);
					})}
				</div>
			) : null}
		</section>
	);
}
