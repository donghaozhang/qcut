import { platform } from "@qcut/platform-core";
import { create } from "zustand";
import { FEATURE_GATES } from "@/lib/feature-gates";
import type { FeatureName, Plan } from "@/lib/feature-gates";

interface CreditBalance {
	planCredits: number;
	topUpCredits: number;
	totalCredits: number;
	planCreditsResetAt: string;
}

interface UserProfile {
	name: string;
	email: string;
	image: string | null;
}

interface LicenseInfo {
	plan: Plan;
	status: "active" | "past_due" | "cancelled" | "expired";
	currentPeriodEnd?: string;
	credits: CreditBalance;
	user?: UserProfile | null;
}

interface LicenseState {
	license: LicenseInfo | null;
	isLoading: boolean;
	checkLicense: () => Promise<void>;
	trackUsage: (type: "ai_generation" | "export" | "render") => Promise<void>;
	canUseFeature: (feature: FeatureName) => boolean;
	hasCredits: (amount: number) => boolean;
	deductCredits: (
		amount: number,
		modelKey: string,
		description: string
	) => Promise<boolean>;
	clearLicense: () => void;
	openBuyCreditsPage: () => void;
	openPricingPage: () => void;
}

const FREE_FALLBACK: LicenseInfo = {
	plan: "free",
	status: "active",
	credits: {
		planCredits: 50,
		topUpCredits: 0,
		totalCredits: 50,
		planCreditsResetAt: "",
	},
};

/**
 * Retrieve the license API client from the platform runtime.
 *
 * @returns The license API object from `platform()` or `undefined` if it is not available.
 */
function getLicenseApi() {
	return platform().license;
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
	license: null,
	isLoading: false,

	checkLicense: async () => {
		set({ isLoading: true });
		try {
			const licenseApi = getLicenseApi();
			if (licenseApi) {
				const license = await licenseApi.check();
				set({ license });
				return;
			}
			set({ license: FREE_FALLBACK });
		} catch {
			set({ license: FREE_FALLBACK });
		} finally {
			set({ isLoading: false });
		}
	},

	canUseFeature: (feature) => {
		const { license } = get();
		if (!license) {
			return feature === "ai-generation";
		}
		return FEATURE_GATES[feature].includes(license.plan);
	},

	hasCredits: (amount) => {
		const { license } = get();
		if (!license || !Number.isFinite(amount) || amount <= 0) {
			return false;
		}
		return license.credits.totalCredits >= amount;
	},

	deductCredits: async (amount, modelKey, description) => {
		if (!Number.isFinite(amount) || amount <= 0) {
			return false;
		}
		if (modelKey.trim().length === 0 || description.trim().length === 0) {
			return false;
		}

		try {
			const licenseApi = getLicenseApi();
			if (!licenseApi) {
				return false;
			}
			const success = await licenseApi.deductCredits(
				amount,
				modelKey,
				description
			);
			if (!success) {
				return false;
			}

			const license = await licenseApi.check();
			set({ license });
			return true;
		} catch {
			return false;
		}
	},

	trackUsage: async (type) => {
		try {
			const licenseApi = getLicenseApi();
			if (!licenseApi) {
				return;
			}
			await licenseApi.trackUsage(type);
		} catch {
			// Usage tracking is non-critical and can fail without blocking UX.
		}
	},

	clearLicense: () => set({ license: null }),

	openBuyCreditsPage: () => {
		window.open(
			"https://quriosity.com.au/pricing#credits",
			"_blank",
			"noopener,noreferrer"
		);
	},

	openPricingPage: () => {
		window.open(
			"https://quriosity.com.au/pricing",
			"_blank",
			"noopener,noreferrer"
		);
	},
}));
