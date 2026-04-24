import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@/test/test-utils";
import { ApiKeysPrecedenceInfo } from "../api-keys-precedence-info";

describe("ApiKeysPrecedenceInfo", () => {
	it("is collapsed by default", () => {
		render(<ApiKeysPrecedenceInfo />);

		expect(
			screen.getByText("How API key resolution works")
		).toBeInTheDocument();
		expect(
			screen.queryByText("Set in your shell or `.env` - highest priority.")
		).not.toBeInTheDocument();
	});

	it("expands to show all precedence tiers", () => {
		render(<ApiKeysPrecedenceInfo />);

		fireEvent.click(
			screen.getByRole("button", { name: /How API key resolution works/ })
		);

		// Post ONE-ENV-FILE migration: three tiers (env / app / file). The
		// "app" label appears in both the tier row and the footer caption.
		expect(screen.getByText("env")).toBeInTheDocument();
		expect(screen.getAllByText("app")).toHaveLength(2);
		expect(screen.getByText("file")).toBeInTheDocument();
	});

	it("renders exactly one interactive disclosure", () => {
		const { container } = render(<ApiKeysPrecedenceInfo />);

		expect(container.querySelectorAll("button[aria-expanded]")).toHaveLength(1);
	});
});
