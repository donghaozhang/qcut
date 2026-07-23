export const AGENT_POINTER_STATE_CHANNEL = "claude:pointer:state";

export type AgentPointerButton = "left" | "middle" | "right";
export type AgentPointerInputMode = "background" | "foreground";
export type AgentPointerInputBackend =
	| "cdp-dispatch-mouse-event"
	| "electron-send-input-event";

export const DEFAULT_AGENT_POINTER_INPUT_MODE: AgentPointerInputMode =
	"background";

export type AgentPointerAction =
	| "hidden"
	| "idle"
	| "move"
	| "hover"
	| "press"
	| "click"
	| "double-click"
	| "right-click"
	| "drag"
	| "scroll";

export interface AgentPointerPoint {
	x: number;
	y: number;
}

export interface AgentPointerTarget extends Partial<AgentPointerPoint> {
	ref?: string;
}

export interface AgentPointerInputOptions {
	inputMode?: AgentPointerInputMode;
}

export interface AgentPointerBounds extends AgentPointerPoint {
	width: number;
	height: number;
}

export interface AgentPointerResolvedTarget extends AgentPointerPoint {
	ref?: string;
	bounds?: AgentPointerBounds;
	tagName?: string;
	role?: string | null;
	name?: string | null;
	value?: string | null;
	disabled?: boolean;
}

export interface AgentPointerMoveRequest
	extends AgentPointerTarget,
		AgentPointerInputOptions {}

export interface AgentPointerClickRequest
	extends AgentPointerTarget,
		AgentPointerInputOptions {}

export interface AgentPointerDragRequest extends AgentPointerInputOptions {
	from: AgentPointerTarget;
	to: AgentPointerTarget;
	via?: AgentPointerTarget[];
	holdMs?: number;
	durationMs?: number;
	steps?: number;
	releaseDelayMs?: number;
}

export type AgentKeyboardModifier = "Alt" | "Control" | "Meta" | "Shift";

export interface AgentKeyboardPressRequest extends AgentPointerInputOptions {
	keys: string[];
	intervalMs?: number;
}

export interface AgentKeyboardTypeRequest extends AgentPointerInputOptions {
	text: string;
	intervalMs?: number;
}

export interface AgentKeyboardResult {
	action: "press" | "type";
	input: "cdp-dispatch-key-event" | "electron-send-input-event";
	inputMode: AgentPointerInputMode;
	windowFocused: boolean;
	keyCount?: number;
	characterCount?: number;
}

export interface AgentPointerScrollRequest
	extends AgentPointerTarget,
		AgentPointerInputOptions {
	deltaX?: number;
	deltaY?: number;
}

export interface AgentPointerVisualState extends AgentPointerPoint {
	visible: boolean;
	active: boolean;
	action: AgentPointerAction;
	label: string;
	pressed: boolean;
	dragging: boolean;
	button: AgentPointerButton | null;
	inputMode: AgentPointerInputMode | null;
	pulseId: number;
	sequence: number;
	timestamp: number;
}

export interface AgentPointerResult extends AgentPointerPoint {
	action: AgentPointerAction;
	visible: boolean;
	input: AgentPointerInputBackend;
	inputMode: AgentPointerInputMode;
	windowFocused: boolean;
	target?: AgentPointerResolvedTarget;
	deltaX?: number;
	deltaY?: number;
}
