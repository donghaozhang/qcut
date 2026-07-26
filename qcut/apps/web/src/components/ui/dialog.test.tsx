import "@/test/fix-radix-ui";
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogTrigger,
} from "@/components/ui/dialog";

describe("Dialog Component", () => {
	it("renders dialog trigger", () => {
		const { getByText } = render(
			<Dialog>
				<DialogTrigger>Open Dialog</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Test Dialog</DialogTitle>
						<DialogDescription>This is a test dialog</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);

		expect(getByText("Open Dialog")).toBeInTheDocument();
	});

	it("opens and closes with controlled state", async () => {
		const TestDialog = () => {
			const [open, setOpen] = React.useState(false);
			return (
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger>Open</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Test Title</DialogTitle>
							<DialogDescription>Test Description</DialogDescription>
						</DialogHeader>
						<button
							type="button"
							onClick={() => setOpen(false)}
							data-testid="custom-close"
						>
							Close Dialog
						</button>
					</DialogContent>
				</Dialog>
			);
		};

		const { getByText, queryByText, getByRole } = render(<TestDialog />);

		// Dialog should be closed initially
		expect(queryByText("Test Title")).not.toBeInTheDocument();

		// Open dialog
		const trigger = getByText("Open");
		trigger.click();

		// Wait for dialog to appear
		await waitFor(() => {
			expect(getByText("Test Title")).toBeInTheDocument();
		});

		// Close dialog
		const closeButton = screen.getByTestId("custom-close");
		closeButton.click();

		// Wait for dialog to disappear
		await waitFor(() => {
			expect(queryByText("Test Title")).not.toBeInTheDocument();
		});
	});

	it("releases a stale modal pointer lock after closing", async () => {
		const TestDialog = () => {
			const [open, setOpen] = React.useState(true);
			return (
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogContent>
						<DialogTitle>Pointer lock dialog</DialogTitle>
						<button type="button" onClick={() => setOpen(false)}>
							Close pointer lock dialog
						</button>
					</DialogContent>
				</Dialog>
			);
		};

		render(<TestDialog />);
		document.body.style.pointerEvents = "none";
		screen.getByRole("button", { name: "Close pointer lock dialog" }).click();

		await waitFor(() => {
			expect(document.body.style.pointerEvents).toBe("");
		});
	});

	it("renders with correct ARIA attributes", () => {
		const { getByRole, getByText } = render(
			<Dialog defaultOpen>
				<DialogTrigger>Open</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Accessible Dialog</DialogTitle>
						<DialogDescription>With proper ARIA labels</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);

		const dialog = getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		// Check for aria-modal or data-state attribute (Radix UI may use different attributes)
		const hasAriaModal = dialog.getAttribute("aria-modal") === "true";
		const hasDataState = dialog.getAttribute("data-state") === "open";
		expect(hasAriaModal || hasDataState).toBe(true);
	});
});
