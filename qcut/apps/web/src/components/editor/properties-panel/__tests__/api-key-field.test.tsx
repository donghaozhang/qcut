import { describe, expect, it, vi } from "vitest";
import { screen } from "@/test/test-utils";
import { render } from "@/test/test-utils";
import { ApiKeyField, KeySourceBadge } from "../api-key-field";
import { PRECEDENCE_ONE_LINERS } from "../api-key-precedence";

function renderApiKeyField({
	value = "abc",
	shadowedBy,
	activeSource,
}: {
	value?: string;
	shadowedBy?: readonly ["electron"];
	activeSource?: "environment";
}) {
	return render(
		<ApiKeyField
			label="FAL AI API Key"
			description="For AI image generation."
			placeholder="Enter key"
			value={value}
			onChange={vi.fn()}
			shadowedBy={shadowedBy}
			activeSource={activeSource}
		/>
	);
}

describe("ApiKeyField", () => {
	it("renders no warning when shadowedBy is undefined or empty", () => {
		const { rerender } = renderApiKeyField({});

		expect(screen.queryByText(/Saved locally/)).not.toBeInTheDocument();

		rerender(
			<ApiKeyField
				label="FAL AI API Key"
				description="For AI image generation."
				placeholder="Enter key"
				value="abc"
				onChange={vi.fn()}
				shadowedBy={[]}
			/>
		);

		expect(screen.queryByText(/Saved locally/)).not.toBeInTheDocument();
	});

	it("renders a warning when an app value is shadowed by environment", () => {
		renderApiKeyField({
			shadowedBy: ["electron"],
			activeSource: "environment",
		});

		expect(screen.getByText(/Saved locally/)).toBeInTheDocument();
		expect(screen.getByText("environment")).toBeInTheDocument();
	});

	it("renders no warning for an empty app value", () => {
		renderApiKeyField({
			value: "",
			shadowedBy: ["electron"],
			activeSource: "environment",
		});

		expect(screen.queryByText(/Saved locally/)).not.toBeInTheDocument();
	});

	it("renders no warning when environment is active but no app value is shadowed", () => {
		render(
			<ApiKeyField
				label="FAL AI API Key"
				description="For AI image generation."
				placeholder="Enter key"
				value="env-value"
				onChange={vi.fn()}
				shadowedBy={[]}
				activeSource="environment"
			/>
		);

		expect(screen.queryByText(/Saved locally/)).not.toBeInTheDocument();
	});

	it("gives the environment badge the tier one-liner as its accessible name", () => {
		render(<KeySourceBadge source="environment" />);

		expect(
			screen.getByLabelText(PRECEDENCE_ONE_LINERS.environment)
		).toBeInTheDocument();
	});

	it("renders the fallback chip only for shadowed app values", () => {
		const { rerender } = renderApiKeyField({
			shadowedBy: ["electron"],
			activeSource: "environment",
		});

		expect(screen.getByText("Fallback value")).toBeInTheDocument();

		rerender(
			<ApiKeyField
				label="FAL AI API Key"
				description="For AI image generation."
				placeholder="Enter key"
				value="abc"
				onChange={vi.fn()}
				shadowedBy={[]}
				activeSource="environment"
			/>
		);

		expect(screen.queryByText("Fallback value")).not.toBeInTheDocument();
	});
});
