import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	JianyingEffectDefinition,
	JianyingEffectRuntimeStatus,
} from "@/types/electron";
import { JianyingEffectLabPanel } from "../effects/jianying-effect-lab-panel";

function definition(
	overrides: Partial<JianyingEffectDefinition>
): JianyingEffectDefinition {
	return {
		id: "jy-effect-1",
		effectId: "1",
		resourceId: "1",
		packageHash: "aaa",
		packagePath: "/cache/effect/1/aaa",
		name: "卷动",
		panel: "effects2",
		defaultDurationMs: 3000,
		adjustParameters: [
			{
				key: "effects_adjust_speed",
				defaultValue: 0.33,
				minimum: 0,
				maximum: 1,
			},
		],
		access: "free",
		supported: true,
		installed: true,
		downloadable: true,
		...overrides,
	};
}

function readyStatus(
	effects: JianyingEffectDefinition[]
): JianyingEffectRuntimeStatus {
	return {
		state: "ready",
		platform: "darwin",
		bridgeReady: true,
		availableCount: effects.filter((e) => e.supported && e.installed).length,
		effects,
		message: "已发现本机剪映特效。",
	};
}

const status = vi.fn();
const preview = vi.fn();
const download = vi.fn();
const renderEffect = vi.fn();

describe("JianyingEffectLabPanel", () => {
	beforeEach(() => {
		status.mockReset();
		preview.mockReset();
		download.mockReset();
		preview.mockResolvedValue({
			effectId: "jy-effect-1",
			dataUrl: "data:image/png;base64,preview",
			width: 320,
			height: 180,
			cached: true,
		});
		(window as unknown as { electronAPI: unknown }).electronAPI = {
			jianyingEffects: { status, preview, download, render: renderEffect },
		};
	});

	afterEach(() => {
		(window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
	});

	it("applies an installed effect with its slider schema", async () => {
		status.mockResolvedValue(readyStatus([definition({})]));
		const onApply = vi.fn();
		render(<JianyingEffectLabPanel onApply={onApply} />);

		const card = await screen.findByTestId("effect-lab-card-jy-effect-1");
		fireEvent.click(card);

		expect(onApply).toHaveBeenCalledTimes(1);
		const preset = onApply.mock.calls[0][0];
		expect(preset.engine).toBe("jianying-local");
		expect(preset.packageHash).toBe("aaa");
		expect(preset.adjustParameters).toEqual([
			{
				key: "effects_adjust_speed",
				defaultValue: 0.33,
				minimum: 0,
				maximum: 1,
			},
		]);
		expect(download).not.toHaveBeenCalled();
	});

	it("downloads an uninstalled effect instead of applying it", async () => {
		const uninstalled = definition({
			id: "jy-effect-2",
			effectId: "2",
			packageHash: "bbb",
			packagePath: "",
			name: "星火",
			installed: false,
		});
		status.mockResolvedValue(readyStatus([definition({}), uninstalled]));
		download.mockResolvedValue({
			effectId: "2",
			packageHash: "bbb",
			packagePath: "/managed/2/bbb",
		});
		const onApply = vi.fn();
		render(<JianyingEffectLabPanel onApply={onApply} />);

		expect(
			await screen.findByText("本机剪映特效 1 个 · 可下载 1 个")
		).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("effect-lab-card-jy-effect-2"));

		await waitFor(() => {
			expect(download).toHaveBeenCalledWith({ effectId: "2" });
		});
		expect(onApply).not.toHaveBeenCalled();
		// A successful download re-checks the runtime so the tile flips to
		// installed.
		await waitFor(() => {
			expect(status).toHaveBeenCalledTimes(2);
		});
	});
});
