import "hono";
import "hono/dist/types/context";

declare module "hono" {
	interface ContextVariableMap {
		userId: string;
	}
}

declare module "hono/dist/types/context" {
	interface ContextVariableMap {
		userId: string;
	}
}
