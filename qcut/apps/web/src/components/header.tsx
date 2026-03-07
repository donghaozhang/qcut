"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { HeaderBase } from "./header-base";
import { ThemeToggle } from "./ui/theme-toggle";
import { getAssetPath } from "@/lib/asset-path";

interface HeaderProps {
	variant?: "default" | "dark" | "landing";
}

export function Header({ variant = "default" }: HeaderProps) {
	const isDark = variant === "dark";
	const isLanding = variant === "landing";

	const leftContent = (
		<Link to="/" className="flex items-center gap-3">
			<img
				src={getAssetPath("assets/logo-v4.png")}
				alt="QCut Logo"
				className="h-8 w-8"
			/>
			<span
				className={`text-xl font-medium hidden md:block ${isDark ? "text-white" : ""}`}
			>
				QCut
			</span>
		</Link>
	);

	const rightContent = (
		<nav className="flex items-center gap-1">
			{!isDark && <ThemeToggle />}
			<div className="flex items-center gap-4 ml-2">
				<a
					href="https://quriosity.com.au/"
					className={`text-sm p-0 transition-colors ${isDark ? "text-neutral-400 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					Blog
				</a>
				<Link
					to="/login"
					className={`text-sm p-0 transition-colors ${isDark ? "text-neutral-400 hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
				>
					Sign in
				</Link>
			</div>
			<Link to="/projects">
				<Button
					size="sm"
					className={`text-sm ml-4 ${isLanding ? "bg-yellow-500 text-black hover:bg-yellow-400 border-0" : isDark ? "bg-yellow-500 text-black hover:bg-yellow-400 border-0" : ""}`}
				>
					Projects
					<ArrowRight className="h-4 w-4" />
				</Button>
			</Link>
		</nav>
	);

	return (
		<div
			className={
				isDark || isLanding
					? "absolute top-0 left-0 right-0 z-20 mx-4 md:mx-0"
					: "mx-4 md:mx-0"
			}
		>
			<HeaderBase
				className={
					isDark
						? "bg-transparent max-w-3xl mx-auto mt-4 pl-4 pr-[14px]"
						: isLanding
							? "bg-background/80 backdrop-blur-sm border rounded-2xl max-w-3xl mx-auto mt-4 pl-4 pr-[14px]"
							: "bg-background border rounded-2xl max-w-3xl mx-auto mt-4 pl-4 pr-[14px]"
				}
				leftContent={leftContent}
				rightContent={rightContent}
			/>
		</div>
	);
}
