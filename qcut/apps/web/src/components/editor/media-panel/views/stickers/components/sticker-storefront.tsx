"use client";

import {
	Check,
	CloudDownload,
	Gem,
	Loader2,
	RefreshCw,
	Store,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	STICKER_STORE_PACKS,
	canAccessStickerPack,
	type StickerStorePack,
} from "@/lib/stickers/sticker-pack-catalog";
import { useLicenseStore } from "@/stores/license-store";
import {
	useStickerPackStore,
	type StickerPackOperation,
} from "@/stores/sticker-pack-store";
import { useStickerPackManager } from "../hooks/use-sticker-pack-manager";
import { StickerGrid } from "./sticker-grid";
import { StickerItem } from "./sticker-item";

interface StickerStorefrontProps {
	onDownload: (iconId: string, name: string) => void | Promise<void>;
	onSelect: (iconId: string, name: string) => void;
}

function packPreviewItems({ pack }: { pack: StickerStorePack }) {
	return pack.items.slice(0, pack.animated ? 12 : 6);
}

function formatByteSize({ bytes }: { bytes: number }): string {
	if (bytes <= 0) return "";
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StickerPackActionIcon({
	builtIn,
	busy,
	hasAccess,
	installed,
	operationStatus,
	updateAvailable,
}: {
	builtIn: boolean;
	busy: boolean;
	hasAccess: boolean;
	installed: boolean;
	operationStatus?: StickerPackOperation["status"];
	updateAvailable: boolean;
}) {
	if (busy) {
		return <Loader2 className="size-3 animate-spin" aria-hidden="true" />;
	}
	if (builtIn) return <Check className="size-3" aria-hidden="true" />;
	if (!hasAccess) return <Gem className="size-3" aria-hidden="true" />;
	if (updateAvailable || operationStatus === "failed") {
		return <RefreshCw className="size-3" aria-hidden="true" />;
	}
	if (installed) return <Trash2 className="size-3" aria-hidden="true" />;
	return <CloudDownload className="size-3" aria-hidden="true" />;
}

export function StickerStorefront({
	onDownload,
	onSelect,
}: StickerStorefrontProps) {
	const installedPacks = useStickerPackStore((state) => state.installedPacks);
	const operationsByPackId = useStickerPackStore(
		(state) => state.operationsByPackId
	);
	const { installPack, removePack } = useStickerPackManager();
	const license = useLicenseStore((state) => state.license);
	const openPricingPage = useLicenseStore((state) => state.openPricingPage);
	const planLabel =
		license?.status === "active" && license.plan !== "free"
			? license.plan.toLocaleUpperCase()
			: "FREE";

	return (
		<div className="h-full overflow-y-auto" data-testid="sticker-storefront">
			<header className="flex items-center justify-between px-3 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<Store className="size-4 shrink-0 text-primary">
						<title>Sticker store</title>
					</Store>
					<div className="min-w-0">
						<h3 className="truncate text-xs font-semibold">贴纸商店</h3>
						<p className="text-[10px] text-muted-foreground">
							{STICKER_STORE_PACKS.length} 个素材包
						</p>
					</div>
				</div>
				<span className="rounded border border-border/70 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
					{planLabel}
				</span>
			</header>

			<TooltipProvider>
				{STICKER_STORE_PACKS.map((pack) => {
					const hasAccess = canAccessStickerPack({
						accessTier: pack.accessTier,
						plan: license?.plan,
						status: license?.status,
					});
					const installedRecord = installedPacks[pack.id];
					const installed = installedRecord !== undefined;
					const updateAvailable =
						installed && installedRecord.version < pack.version;
					const operation = operationsByPackId[pack.id];
					const busy =
						operation?.status === "installing" ||
						operation?.status === "removing";
					const progressPercent = Math.round((operation?.progress ?? 0) * 100);
					const locked = !hasAccess || !installed;
					let actionLabel = "下载";
					if (pack.builtIn) actionLabel = "内置";
					if (!hasAccess) actionLabel = "升级";
					if (installed && !updateAvailable && !pack.builtIn) {
						actionLabel = "移除";
					}
					if (updateAvailable) actionLabel = "更新";
					if (operation?.status === "installing") {
						actionLabel = `下载 ${progressPercent}%`;
					}
					if (operation?.status === "removing") {
						actionLabel = `移除 ${progressPercent}%`;
					}
					if (operation?.status === "failed") actionLabel = "重试";
					const handleLockedSelect = () => {
						if (!hasAccess) {
							toast.info(`${pack.localizedName} 需要 QCut Pro`);
							openPricingPage();
							return;
						}
						toast.info(`请先添加 ${pack.localizedName}`);
					};
					return (
						<section
							key={pack.id}
							className="border-t border-border/50 px-3 py-3"
							data-testid={`sticker-pack-${pack.id}`}
						>
							<div className="mb-2.5 flex items-start justify-between gap-2">
								<div className="flex min-w-0 gap-2">
									<span className="text-base" aria-hidden="true">
										{pack.emoji}
									</span>
									<div className="min-w-0">
										<div className="flex items-center gap-1">
											<h4 className="truncate text-[11px] font-medium">
												{pack.localizedName}
											</h4>
											{pack.accessTier === "pro" && (
												<Gem className="size-3 shrink-0 text-cyan-300">
													<title>QCut Pro pack</title>
												</Gem>
											)}
										</div>
										<p className="mt-0.5 line-clamp-2 text-[9px] leading-3 text-muted-foreground">
											{pack.description}
										</p>
										<p className="mt-1 text-[9px] tabular-nums text-muted-foreground">
											{pack.items.length} 个 · v{pack.version}
											{installedRecord?.cachedBytes
												? ` · ${formatByteSize({ bytes: installedRecord.cachedBytes })}`
												: ""}
										</p>
									</div>
								</div>
								<Button
									type="button"
									variant={installed ? "outline" : "secondary"}
									size="sm"
									className="h-7 shrink-0 gap-1 px-2 text-[10px]"
									disabled={pack.builtIn || busy}
									onClick={() => {
										if (!hasAccess) {
											openPricingPage();
											return;
										}
										if (installed && !updateAvailable) {
											void removePack({ pack }).then((removed) => {
												if (removed)
													toast.success(`已移除 ${pack.localizedName}`);
												if (!removed)
													toast.error(`移除 ${pack.localizedName} 失败`);
											});
											return;
										}
										void installPack({ pack }).then((installedSuccessfully) => {
											if (installedSuccessfully) {
												toast.success(
													updateAvailable
														? `已更新 ${pack.localizedName}`
														: `已下载 ${pack.localizedName}`
												);
												return;
											}
											toast.error(`下载 ${pack.localizedName} 失败`);
										});
									}}
									onKeyDown={(event) => {
										if (event.key === " ") {
											event.preventDefault();
											event.currentTarget.click();
										}
									}}
								>
									<StickerPackActionIcon
										builtIn={pack.builtIn}
										busy={busy}
										hasAccess={hasAccess}
										installed={installed}
										operationStatus={operation?.status}
										updateAvailable={updateAvailable}
									/>
									{actionLabel}
								</Button>
							</div>
							{busy && operation && (
								<div className="mb-2.5 space-y-1">
									<Progress value={progressPercent} className="h-1" />
									<p className="text-right text-[9px] tabular-nums text-muted-foreground">
										{operation.completedItems}/{operation.totalItems}
									</p>
								</div>
							)}
							{operation?.status === "failed" && operation.error && (
								<p className="mb-2.5 line-clamp-2 text-[9px] text-destructive">
									{operation.error}
								</p>
							)}

							<StickerGrid testId={`sticker-pack-grid-${pack.id}`}>
								{packPreviewItems({ pack }).map((sticker) => (
									<StickerItem
										key={sticker.id}
										accessTier={pack.accessTier}
										animated={sticker.animated}
										collection={sticker.collection}
										icon={sticker.icon}
										isLocked={locked}
										layout="catalog"
										name={sticker.name}
										onDownload={onDownload}
										onLockedSelect={handleLockedSelect}
										onSelect={onSelect}
									/>
								))}
							</StickerGrid>
						</section>
					);
				})}
			</TooltipProvider>
		</div>
	);
}
