import { describe, expect, it } from "vitest";
import {
	ALLOW_ANY_SIGNED_IN_USER,
	isUserIdAllowlisted,
} from "./user-id-allowlist";

const USER = "79bf60b02770d2cc510da53e471590f4";
const OTHER = "3c81ac37cdd53e079e3ed35e96ac5fac";

describe("isUserIdAllowlisted", () => {
	it("admits a listed user", () => {
		expect(
			isUserIdAllowlisted({ allowlist: `${USER},${OTHER}`, userId: USER })
		).toBe(true);
	});

	it("refuses an unlisted user", () => {
		expect(isUserIdAllowlisted({ allowlist: OTHER, userId: USER })).toBe(false);
	});

	it.each([
		undefined,
		"",
		"   ",
		",,",
	])("fails closed when the allowlist is %p", (allowlist) => {
		expect(isUserIdAllowlisted({ allowlist, userId: USER })).toBe(false);
	});

	it("tolerates padding around entries", () => {
		expect(
			isUserIdAllowlisted({ allowlist: ` ${OTHER} , ${USER} `, userId: USER })
		).toBe(true);
	});

	describe(`"${ALLOW_ANY_SIGNED_IN_USER}" sentinel`, () => {
		it("admits any signed-in account", () => {
			expect(
				isUserIdAllowlisted({
					allowlist: ALLOW_ANY_SIGNED_IN_USER,
					userId: "any-account-at-all",
				})
			).toBe(true);
		});

		it("works alongside explicit entries", () => {
			expect(
				isUserIdAllowlisted({
					allowlist: `${USER},${ALLOW_ANY_SIGNED_IN_USER}`,
					userId: OTHER,
				})
			).toBe(true);
		});

		// The sentinel widens WHO may pass, never WHETHER a session is needed:
		// authMiddleware still runs first, and a missing userId is still a no.
		it("still refuses a caller with no session", () => {
			expect(
				isUserIdAllowlisted({
					allowlist: ALLOW_ANY_SIGNED_IN_USER,
					userId: undefined,
				})
			).toBe(false);
		});

		it("is not matched by a user literally named like the sentinel prefix", () => {
			expect(isUserIdAllowlisted({ allowlist: USER, userId: "*" })).toBe(false);
		});
	});
});
