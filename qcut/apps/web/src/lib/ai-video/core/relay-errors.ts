/**
 * Typed errors raised by the license-server relay path so the renderer
 * can target specific failure modes (e.g. show a "Top up" CTA on 402)
 * without string-matching generic error messages.
 */

import type { CreditBalanceInfo } from "./relay-types";

export class InsufficientCreditsError extends Error {
	readonly name = "InsufficientCreditsError";
	readonly required: number;
	readonly balance?: CreditBalanceInfo;

	constructor(params: {
		required: number;
		balance?: CreditBalanceInfo;
		modelKey: string;
	}) {
		super(
			`Insufficient credits for ${params.modelKey} — needed ${params.required.toFixed(
				2
			)}${
				params.balance ? `, have ${params.balance.totalCredits.toFixed(2)}` : ""
			}.`
		);
		this.required = params.required;
		this.balance = params.balance;
	}
}

export function isInsufficientCreditsError(
	error: unknown
): error is InsufficientCreditsError {
	return (
		error instanceof Error &&
		(error as { name?: string }).name === "InsufficientCreditsError"
	);
}
