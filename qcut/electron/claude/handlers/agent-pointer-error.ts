export class AgentPointerError extends Error {
	statusCode: number;

	constructor({
		message,
		statusCode,
	}: { message: string; statusCode: number }) {
		super(message);
		this.name = "AgentPointerError";
		this.statusCode = statusCode;
	}
}
