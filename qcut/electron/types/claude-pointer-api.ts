export const AGENT_POINTER_STATE_CHANNEL = "claude:pointer:state";

export type AgentPointerButton = "left" | "middle" | "right";

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

export interface AgentPointerMoveRequest extends AgentPointerTarget {}

export interface AgentPointerClickRequest extends AgentPointerTarget {}

export interface AgentPointerDragRequest {
	from: AgentPointerTarget;
	to: AgentPointerTarget;
}

export interface AgentPointerScrollRequest extends AgentPointerTarget {
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
	pulseId: number;
	sequence: number;
	timestamp: number;
}

export interface AgentPointerResult extends AgentPointerPoint {
	action: AgentPointerAction;
	visible: boolean;
	input: "electron-send-input-event";
	target?: AgentPointerResolvedTarget;
	deltaX?: number;
	deltaY?: number;
}
