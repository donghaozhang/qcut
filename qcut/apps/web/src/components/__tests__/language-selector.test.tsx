import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageSelector } from "../language-selector";
import { LocaleSync } from "../locale-sync";
import { useLocaleStore } from "@/stores/locale-store";

describe("LanguageSelector", () => {
	beforeEach(() => {
		localStorage.clear();
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	afterEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	it("switches the live interface language and persists the selection", async () => {
		render(
			<>
				<LocaleSync />
				<LanguageSelector />
			</>
		);

		fireEvent.pointerDown(screen.getByTestId("language-selector"), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(
			await screen.findByRole("menuitemradio", { name: "English" })
		);

		await waitFor(() => {
			expect(useLocaleStore.getState().locale).toBe("en");
			expect(document.documentElement.lang).toBe("en");
			expect(screen.getByTestId("language-selector")).toHaveTextContent("EN");
		});

		expect(localStorage.setItem).toHaveBeenCalledWith(
			"qcut-interface-language",
			expect.stringContaining('"locale":"en"')
		);
	});
});
