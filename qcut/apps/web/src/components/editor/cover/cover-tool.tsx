import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";

export function activateCoverControl({
	event,
}: {
	event: KeyboardEvent<HTMLButtonElement>;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	event.stopPropagation();
	event.currentTarget.click();
}

export function CoverTool({
	icon: Icon,
	label,
	onClick,
	disabled,
	active,
	testId,
}: {
	icon: LucideIcon;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	testId?: string;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			data-testid={testId}
			className={`cover-tool ${active ? "is-active" : ""}`}
			onClick={onClick}
			onKeyDown={(event) => activateCoverControl({ event })}
		>
			<Icon size={16}>
				<title>{label}</title>
			</Icon>
		</button>
	);
}
