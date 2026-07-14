"use client";

import { Check, Gem, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	STICKER_STORE_PACKS,
	canAccessStickerPack,
	type StickerStorePack,
} from "@/lib/stickers/sticker-pack-catalog";
import { useLicenseStore } from "@/stores/license-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";
import { StickerGrid } from "./sticker-grid";
import { StickerItem } from "./sticker-item";

interface StickerStorefrontProps {
	onDownload: (iconId: string, name: string) => void | Promise<void>;
	onSelect: (iconId: string, name: string) => void;
}

function packPreviewItems({ pack }: { pack: StickerStorePack }) {
	return pack.items.slice(0, pack.animated ? 12 : 6);
}

export function StickerStorefront({
	onDownload,
	onSelect,
}: StickerStorefrontProps) {
	const installedPackIds = useStickerPackStore(
		(state) => state.installedPackIds
	);
	const installPack = useStickerPackStore((state) => state.installPack);
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
					const installed = installedPackIds[pack.id] === true;
					const locked = !hasAccess || !installed;
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
									</div>
								</div>
								<Button
									type="button"
									variant={installed ? "outline" : "secondary"}
									size="sm"
									className="h-7 shrink-0 gap-1 px-2 text-[10px]"
									disabled={installed}
									onClick={() => {
										if (!hasAccess) {
											openPricingPage();
											return;
										}
										installPack({ packId: pack.id });
										toast.success(`已添加 ${pack.localizedName}`);
									}}
									onKeyDown={(event) => {
										if (event.key === " ") {
											event.preventDefault();
											event.currentTarget.click();
										}
									}}
								>
									{installed ? (
										<Check className="size-3" aria-hidden="true" />
									) : hasAccess ? (
										<Plus className="size-3" aria-hidden="true" />
									) : (
										<Gem className="size-3" aria-hidden="true" />
									)}
									{installed ? "已添加" : hasAccess ? "添加" : "升级"}
								</Button>
							</div>

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
