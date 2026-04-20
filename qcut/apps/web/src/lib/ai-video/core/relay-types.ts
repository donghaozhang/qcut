/**
 * Shapes shared between the license-server relay, the error classes,
 * and the renderer license store. Kept provider-agnostic.
 */

export interface CreditBalanceInfo {
	planCredits: number;
	topUpCredits: number;
	totalCredits: number;
	planCreditsResetAt: string;
}
