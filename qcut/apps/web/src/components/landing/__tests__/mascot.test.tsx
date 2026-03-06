import { render, screen, waitFor } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { createElement, forwardRef, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { Mascot } from "../mascot";

type MotionAnimation = {
	fill?: string;
	stroke?: string;
};

type MotionComponentProps = {
	animate?: MotionAnimation;
	children?: ReactNode;
	style?: CSSProperties;
};

function buildMotionComponent({
	tag,
}: {
	tag: "circle" | "div" | "rect" | "span";
}) {
	return forwardRef<HTMLElement | SVGElement, MotionComponentProps>(
		function MotionComponent({ animate, children, style, ...props }, ref) {
			const nextProps: Record<string, unknown> = { ...props, ref, style };
			if (animate?.fill) nextProps.fill = animate.fill;
			if (animate?.stroke) nextProps.stroke = animate.stroke;
			return createElement(tag, nextProps, children);
		}
	);
}

vi.mock("motion/react", () => ({
	motion: {
		circle: buildMotionComponent({ tag: "circle" }),
		div: buildMotionComponent({ tag: "div" }),
		rect: buildMotionComponent({ tag: "rect" }),
		span: buildMotionComponent({ tag: "span" }),
	},
	useAnimationFrame: (callback: () => void) => {
		useEffect(() => {
			callback();
		}, [callback]);
	},
}));

interface MotionValueLike {
	get: () => number;
}

function createMotionValue({
	progress,
}: {
	progress: number;
}): MotionValueLike {
	return {
		get: () => progress,
	};
}

describe("Mascot", () => {
	it("keeps idle styling when the playhead is inactive", async () => {
		const { container } = render(
			<Mascot
				playheadProgress={createMotionValue({ progress: 0.995 }) as never}
			/>
		);

		await waitFor(() => {
			expect(container.querySelector('rect[stroke="#FFFFFF"]')).toBeTruthy();
		});

		expect(container.querySelector('circle[fill="#FFFFFF"]')).toBeTruthy();
		expect(screen.queryByText("Generating ...")).toBeNull();
		expect(screen.queryByText("Cutting ...")).toBeNull();
	});

	it("switches accent styling for generate and cut states", async () => {
		const { container, rerender } = render(
			<Mascot
				playheadProgress={createMotionValue({ progress: 0.3 }) as never}
			/>
		);

		await waitFor(() => {
			expect(screen.queryByText("Generating ...")).toBeTruthy();
		});

		expect(container.querySelector('rect[stroke="#38BDF8"]')).toBeTruthy();
		expect(container.querySelector('circle[fill="#38BDF8"]')).toBeTruthy();

		rerender(
			<Mascot
				playheadProgress={createMotionValue({ progress: 0.62 }) as never}
			/>
		);

		await waitFor(() => {
			expect(screen.queryByText("Cutting ...")).toBeTruthy();
		});

		expect(container.querySelector('rect[stroke="#EF4444"]')).toBeTruthy();
		expect(container.querySelector('circle[fill="#EF4444"]')).toBeTruthy();
	});
});
