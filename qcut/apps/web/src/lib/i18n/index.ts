import { useCallback } from "react";
import { useLocaleStore } from "@/stores/locale-store";
import {
	TRANSLATIONS,
	type AppLocale,
	type TranslationKey,
} from "./translations";

type TranslationValues = Record<string, string | number>;

export function translate({
	locale,
	key,
	values,
}: {
	locale: AppLocale;
	key: TranslationKey;
	values?: TranslationValues;
}): string {
	const template = TRANSLATIONS[locale][key];
	if (!values) return template;

	return Object.entries(values).reduce(
		(result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
		template
	);
}

export function useTranslation() {
	const locale = useLocaleStore((state) => state.locale);
	const t = useCallback(
		(key: TranslationKey, values?: TranslationValues) =>
			translate({ locale, key, values }),
		[locale]
	);

	return { locale, t };
}

export type { AppLocale, TranslationKey } from "./translations";
export { SUPPORTED_LOCALES } from "./translations";
