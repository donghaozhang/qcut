import { useEffect } from "react";
import { useLocaleStore } from "@/stores/locale-store";

export function LocaleSync() {
	const locale = useLocaleStore((state) => state.locale);

	useEffect(() => {
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
	}, [locale]);

	return null;
}
