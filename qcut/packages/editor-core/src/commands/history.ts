/**
 * History stack for undo/redo operations.
 *
 * Pure functional implementation — no framework dependencies.
 * Works with any serializable state type.
 *
 * @module @qcut/editor-core/commands/history
 */

/** Immutable history state container. */
export interface HistoryState<T> {
	/** Stack of previous states (undo targets) */
	past: T[];
	/** Stack of undone states (redo targets) */
	future: T[];
}

/** Create an empty history state. */
export function createHistory<T>(): HistoryState<T> {
	return { past: [], future: [] };
}

/**
 * Push a new state snapshot onto the history stack.
 * Clears the redo stack (branching).
 */
export function pushState<T>(
	history: HistoryState<T>,
	state: T
): HistoryState<T> {
	return {
		past: [...history.past, state],
		future: [],
	};
}

/**
 * Undo: pop from past, push current state to future.
 * Returns null if nothing to undo.
 */
export function undo<T>(
	history: HistoryState<T>,
	currentState: T
): { history: HistoryState<T>; restoredState: T } | null {
	if (history.past.length === 0) return null;

	const restoredState = history.past[history.past.length - 1];
	return {
		history: {
			past: history.past.slice(0, -1),
			future: [...history.future, currentState],
		},
		restoredState,
	};
}

/**
 * Redo: pop from future, push current state to past.
 * Returns null if nothing to redo.
 */
export function redo<T>(
	history: HistoryState<T>,
	currentState: T
): { history: HistoryState<T>; restoredState: T } | null {
	if (history.future.length === 0) return null;

	const restoredState = history.future[history.future.length - 1];
	return {
		history: {
			past: [...history.past, currentState],
			future: history.future.slice(0, -1),
		},
		restoredState,
	};
}

/** Check if undo is available. */
export function canUndo<T>(history: HistoryState<T>): boolean {
	return history.past.length > 0;
}

/** Check if redo is available. */
export function canRedo<T>(history: HistoryState<T>): boolean {
	return history.future.length > 0;
}

/** Clear all history. */
export function clearHistory<T>(): HistoryState<T> {
	return { past: [], future: [] };
}
