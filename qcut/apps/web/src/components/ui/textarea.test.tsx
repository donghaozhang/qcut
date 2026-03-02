import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Textarea } from "@/components/ui/textarea";
import { createRef } from "react";

afterEach(() => {
	cleanup();
});

describe("Textarea", () => {
	it("renders a textarea element", () => {
		const { container } = render(<Textarea />);
		const textarea = container.querySelector("textarea");
		expect(textarea).toBeInTheDocument();
	});

	it("applies custom className", () => {
		const { container } = render(<Textarea className="custom-class" />);
		const textarea = container.querySelector("textarea");
		expect(textarea?.className).toContain("custom-class");
	});

	it("forwards ref as callback function", () => {
		const refFn = vi.fn();
		render(<Textarea ref={refFn} />);
		expect(refFn).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
	});

	it("forwards ref as ref object", () => {
		const ref = createRef<HTMLTextAreaElement>();
		render(<Textarea ref={ref} />);
		expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
	});

	it("adds overflow-hidden class when autoResize is true", () => {
		const { container } = render(<Textarea autoResize />);
		const textarea = container.querySelector("textarea");
		expect(textarea?.className).toContain("overflow-hidden");
	});

	it("does not add overflow-hidden when autoResize is false", () => {
		const { container } = render(<Textarea />);
		const textarea = container.querySelector("textarea");
		expect(textarea?.className).not.toContain("overflow-hidden");
	});

	it("passes value prop to textarea", () => {
		const { container } = render(<Textarea value="hello" readOnly />);
		const textarea = container.querySelector("textarea");
		expect(textarea).toHaveValue("hello");
	});
});
