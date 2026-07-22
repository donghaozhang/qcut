import {
	DEFAULT_AGENT_POINTER_INPUT_MODE,
	type AgentPointerInputBackend,
	type AgentPointerInputMode,
} from "../../types/claude-api.js";
import {
	type AgentPointerInput,
	type AgentPointerInputSession,
} from "./agent-pointer-input.js";

interface AgentPointerInputMetadata {
	inputMode: AgentPointerInputMode;
	backend: AgentPointerInputBackend;
}

export class AgentPointerOperationQueue {
	private readonly input: AgentPointerInput;
	private queue: Promise<void> = Promise.resolve();
	private lastInput: AgentPointerInputMetadata = {
		inputMode: DEFAULT_AGENT_POINTER_INPUT_MODE,
		backend: "cdp-dispatch-mouse-event",
	};

	constructor({ input }: { input: AgentPointerInput }) {
		this.input = input;
	}

	getLastInput(): AgentPointerInputMetadata {
		return { ...this.lastInput };
	}

	run<T>({ operation }: { operation: () => Promise<T> }): Promise<T> {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	runInput<T>({
		inputMode = DEFAULT_AGENT_POINTER_INPUT_MODE,
		operation,
	}: {
		inputMode?: AgentPointerInputMode;
		operation: (input: { session: AgentPointerInputSession }) => Promise<T>;
	}): Promise<T> {
		return this.run({
			operation: async () => {
				const session = await this.input.begin({ inputMode });
				this.lastInput = {
					inputMode: session.inputMode,
					backend: session.backend,
				};
				try {
					return await operation({ session });
				} finally {
					await this.input.end({ session });
				}
			},
		});
	}
}
