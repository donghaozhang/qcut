export function StudioBackground() {
	return (
		<div
			aria-hidden="true"
			data-testid="studio-background"
			className="pointer-events-none fixed inset-0 overflow-hidden hidden dark:block"
		>
			<div className="studio-grid absolute inset-0 opacity-[0.03]" />
			<div
				className="absolute inset-0 opacity-[0.04]"
				style={{
					background:
						"radial-gradient(ellipse at 50% 30%, hsla(38, 80%, 50%, 0.4), transparent 70%)",
				}}
			/>
		</div>
	);
}
