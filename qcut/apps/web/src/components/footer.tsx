"use client";

import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { RiTwitterXLine } from "react-icons/ri";
import { FaGithub } from "react-icons/fa6";
import { getAssetPath } from "@/lib/asset-path";

export function Footer() {
	return (
		<motion.footer
			className="bg-background border-t"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ delay: 0.8, duration: 0.8 }}
		>
			<div className="max-w-5xl mx-auto px-8 py-6">
				<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					{/* Brand */}
					<div className="flex items-center gap-3">
						<img
							src={getAssetPath("assets/logo-v4.png")}
							alt="QCut"
							className="h-5 w-5"
						/>
						<span className="font-semibold">QCut</span>
						<span className="text-sm text-muted-foreground hidden sm:inline">
							— The agentic video creation platform
						</span>
					</div>

					{/* Links */}
					<nav className="flex items-center gap-4 text-sm">
						<Link
							to="/privacy"
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							Privacy
						</Link>
						<Link
							to="/terms"
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							Terms
						</Link>
						<a
							href="https://quriosity.com.au/"
							className="text-muted-foreground hover:text-foreground transition-colors"
							target="_blank"
							rel="noopener noreferrer"
						>
							About
						</a>
					</nav>

					{/* Social + copyright */}
					<div className="flex items-center gap-4">
						<a
							href="https://github.com/donghaozhang/qcut"
							className="text-muted-foreground hover:text-foreground transition-colors"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Visit QCut GitHub repository"
						>
							<FaGithub className="h-4 w-4" />
						</a>
						<a
							href="https://x.com/peter6759"
							className="text-muted-foreground hover:text-foreground transition-colors"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Follow QCut on X"
						>
							<RiTwitterXLine className="h-4 w-4" />
						</a>
						<span className="text-xs text-muted-foreground/60 hidden md:inline">
							© 2025 QCut
						</span>
					</div>
				</div>

				{/* Mobile copyright */}
				<div className="mt-3 text-xs text-muted-foreground/60 md:hidden">
					© 2025 QCut, All Rights Reserved
				</div>
			</div>
		</motion.footer>
	);
}
