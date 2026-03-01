import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/landing/hero";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	return (
		<div className="bg-black min-h-screen relative">
			<Header variant="dark" />
			<Hero />
			<Footer />
		</div>
	);
}
