import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { openInNewTab } from "@/lib/utils";

export const Route = createFileRoute("/blog")({
	component: BlogPage,
});

function BlogPage() {
	const handleRedirectToGitHub = () => {
		if (window.electronAPI?.shell?.openExternal) {
			window.electronAPI.shell.openExternal(
				"https://github.com/donghaozhang/qcut"
			);
		} else {
			openInNewTab("https://github.com/donghaozhang/qcut");
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<Header />

			<main className="relative">
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<div className="absolute -top-40 -right-40 w-96 h-96 bg-linear-to-br from-muted/20 to-transparent rounded-full blur-3xl" />
					<div className="absolute top-1/2 -left-40 w-80 h-80 bg-linear-to-tr from-muted/10 to-transparent rounded-full blur-3xl" />
				</div>

				<div className="relative container max-w-3xl mx-auto px-4 py-16">
					<div className="text-center">
						<h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
							Latest Updates
						</h1>
						<p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
							Stay up to date with the latest news, features, and updates about
							QCut on our GitHub repository.
						</p>

						<Button
							onClick={handleRedirectToGitHub}
							size="lg"
							className="gap-2"
						>
							<ExternalLink className="w-4 h-4" />
							Visit QCut on GitHub
						</Button>

						<p className="text-sm text-muted-foreground mt-4">
							Find release notes, documentation, and discussions at
							<br />
							<span className="font-mono">github.com/donghaozhang/qcut</span>
						</p>
					</div>
				</div>
			</main>
		</div>
	);
}
