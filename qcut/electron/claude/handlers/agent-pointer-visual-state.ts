import type { BrowserWindow } from "electron";
import {
	AGENT_POINTER_STATE_CHANNEL,
	type AgentPointerAction,
	type AgentPointerVisualState,
} from "../../types/claude-api.js";

const POINTER_IDLE_DELAY_MS = 900;

function actionLabel({ action }: { action: AgentPointerAction }): string {
	switch (action) {
		case "move":
			return "移动光标";
		case "hover":
			return "悬停查看";
		case "press":
			return "按住鼠标";
		case "click":
			return "点击";
		case "double-click":
			return "双击";
		case "right-click":
			return "右键点击";
		case "drag":
			return "拖拽";
		case "scroll":
			return "滚动";
		case "idle":
			return "Agent 已就绪";
		case "hidden":
			return "";
	}
}

export class AgentPointerVisualStateStore {
	private readonly win: BrowserWindow;
	private idleTimer: ReturnType<typeof setTimeout> | undefined;
	private state: AgentPointerVisualState = {
		visible: false,
		active: false,
		action: "hidden",
		label: "",
		x: 0,
		y: 0,
		pressed: false,
		dragging: false,
		button: null,
		pulseId: 0,
		sequence: 0,
		timestamp: Date.now(),
	};

	constructor({ win }: { win: BrowserWindow }) {
		this.win = win;
	}

	getState(): AgentPointerVisualState {
		return { ...this.state };
	}

	update(
		updates: Partial<AgentPointerVisualState> & {
			action: AgentPointerAction;
		}
	): void {
		this.clearIdle();
		this.state = {
			...this.state,
			...updates,
			visible: updates.visible ?? updates.action !== "hidden",
			active:
				updates.active ??
				(updates.action !== "idle" && updates.action !== "hidden"),
			label: actionLabel({ action: updates.action }),
			sequence: this.state.sequence + 1,
			timestamp: Date.now(),
		};
		if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
			this.win.webContents.send(AGENT_POINTER_STATE_CHANNEL, this.getState());
		}
	}

	scheduleIdle(): void {
		this.clearIdle();
		this.idleTimer = setTimeout(() => {
			if (!this.state.visible || this.state.pressed || this.state.dragging)
				return;
			this.update({
				action: "idle",
				active: false,
				pressed: false,
				dragging: false,
				button: null,
			});
		}, POINTER_IDLE_DELAY_MS);
	}

	clearIdle(): void {
		if (this.idleTimer !== undefined) {
			clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
		}
	}
}
