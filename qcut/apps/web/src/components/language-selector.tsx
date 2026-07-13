import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation, type AppLocale } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale-store";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
	const { locale, t } = useTranslation();
	const setLocale = useLocaleStore((state) => state.setLocale);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="secondary"
					size={compact ? "icon" : "sm"}
					className={compact ? "size-7" : "h-7 gap-1.5 px-2 text-xs"}
					aria-label={t("language.switch")}
					title={t("language.switch")}
					data-testid="language-selector"
				>
					<Languages className="size-4" />
					{compact ? null : <span>{locale === "zh" ? "中" : "EN"}</span>}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-36">
				<DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={locale}
					onValueChange={(value) => setLocale({ locale: value as AppLocale })}
				>
					<DropdownMenuRadioItem value="zh">
						{t("language.zh")}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="en">
						{t("language.en")}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
