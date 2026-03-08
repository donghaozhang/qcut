export interface CreditBalance {
	planCredits: number;
	topUpCredits: number;
	totalCredits: number;
	planCreditsResetAt: string;
}

export interface UserProfile {
	name: string;
	email: string;
	image: string | null;
}

export interface LicenseInfo {
	plan: "free" | "pro" | "team";
	status: "active" | "past_due" | "cancelled" | "expired";
	currentPeriodEnd?: string;
	credits: CreditBalance;
	user?: UserProfile | null;
}

export interface ElectronLicenseOps {
	license?: {
		check: () => Promise<LicenseInfo>;
		activate: (token: string) => Promise<boolean>;
		trackUsage: (
			type: "ai_generation" | "export" | "render"
		) => Promise<boolean>;
		deductCredits: (
			amount: number,
			modelKey: string,
			description: string
		) => Promise<boolean>;
		setAuthToken: (token: string) => Promise<boolean>;
		getAuthToken: () => Promise<string>;
		clearAuthToken: () => Promise<boolean>;
		onActivationToken: (callback: (token: string) => void) => () => void;
		deactivate: () => Promise<boolean>;
		emailLogin: (
			email: string,
			password: string
		) => Promise<{ success: boolean; error?: string }>;
		emailSignup: (
			name: string,
			email: string,
			password: string
		) => Promise<{ success: boolean; error?: string }>;
		getGoogleLoginUrl: () => Promise<string>;
	};
}
