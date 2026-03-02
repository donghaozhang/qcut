export function StudioBackground() {
	return (
		<div
			aria-hidden="true"
			data-testid="studio-background"
			className="pointer-events-none fixed inset-0 overflow-hidden hidden dark:block"
		>
			<div className="studio-grid absolute inset-0 opacity-[0.03]" />
		</div>
	);
}
