import * as React from "react";

import { cn } from "../../lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
	/** When true, textarea grows automatically as user types */
	autoResize?: boolean;
	/** Maximum height in pixels when autoResize is enabled (default: 300) */
	maxHeight?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
	(
		{ className, autoResize, maxHeight = 300, value, ...props },
		forwardedRef
	) => {
		const internalRef = React.useRef<HTMLTextAreaElement>(null);

		const setRefs = React.useCallback(
			(node: HTMLTextAreaElement | null) => {
				internalRef.current = node;
				if (typeof forwardedRef === "function") {
					forwardedRef(node);
				} else if (forwardedRef) {
					(
						forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>
					).current = node;
				}
			},
			[forwardedRef]
		);

		// biome-ignore lint/correctness/useExhaustiveDependencies: value prop triggers resize recalculation
		React.useEffect(() => {
			if (!autoResize || !internalRef.current) return;
			const el = internalRef.current;
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
		}, [autoResize, maxHeight, value]);

		return (
			<textarea
				className={cn(
					"flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-0 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-xs",
					autoResize && "overflow-hidden",
					className
				)}
				ref={setRefs}
				value={value}
				{...props}
			/>
		);
	}
);
Textarea.displayName = "Textarea";

export { Textarea };
