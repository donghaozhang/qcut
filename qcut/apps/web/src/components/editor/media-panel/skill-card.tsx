"use client";

import { platform } from "@qcut/platform-core";
import { useState, useEffect } from "react";
import type { Skill } from "@/types/skill";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Brain,
	Trash2,
	Play,
	ChevronDown,
	ChevronRight,
	FileText,
	Copy,
	Folder,
	Check,
	Sparkles,
	Bot,
} from "lucide-react";
import { toast } from "sonner";
import { useSkillRunner } from "@/hooks/use-skill-runner";
import { useProjectStore } from "@/stores/project-store";
import { cn } from "@/lib/utils";

interface SkillCardProps {
	skill: Skill;
	onDelete: () => void;
}

export function SkillCard({ skill, onDelete }: SkillCardProps) {
	const { runSkill } = useSkillRunner();
	const { activeProject } = useProjectStore();
	const [isExpanded, setIsExpanded] = useState(false);
	const [skillsBasePath, setSkillsBasePath] = useState<string | null>(null);
	const [copiedPath, setCopiedPath] = useState<string | null>(null);

	// Get the skills folder path when expanded
	useEffect(() => {
		if (isExpanded && activeProject && !skillsBasePath) {
			const getPathPromise = platform().skills?.getPath?.(
				activeProject.id
			);
			getPathPromise
				?.then((path) => {
					if (path) {
						setSkillsBasePath(path);
					}
				})
				.catch((err) => {
					console.error("[SkillCard] Failed to get skills path:", err);
				});
		}
	}, [isExpanded, activeProject, skillsBasePath]);

	const handleRunWithGemini = () => {
		runSkill(skill.id, "gemini");
		toast.info(`Running "${skill.name}" with Gemini CLI`, {
			description: "Switching to terminal...",
		});
	};

	const handleRunWithCodex = () => {
		runSkill(skill.id, "codex");
		toast.info(`Running "${skill.name}" with Codex (OpenRouter)`, {
			description: "Switching to terminal...",
		});
	};

	const handleRunWithClaude = () => {
		runSkill(skill.id, "claude");
		toast.info(`Running "${skill.name}" with Claude Code`, {
			description: "Switching to terminal...",
		});
	};

	const handleDelete = () => {
		if (window.confirm(`Delete skill "${skill.name}" from this project?`)) {
			onDelete();
			toast.success(`Deleted "${skill.name}"`);
		}
	};

	const [isCopying, setIsCopying] = useState(false);

	const copyToClipboard = async (path: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (isCopying) return;
		setIsCopying(true);

		try {
			await navigator.clipboard.writeText(path);
			setCopiedPath(path);
			toast.success("Path copied to clipboard", { id: "skill-path-copy" });
			setTimeout(() => setCopiedPath(null), 2000);
		} catch {
			toast.error("Failed to copy path", { id: "skill-path-copy-error" });
		} finally {
			setTimeout(() => setIsCopying(false), 300);
		}
	};

	// Build full paths for files
	const getFilePath = (filename: string) => {
		if (!skillsBasePath) return "";
		// Handle both Windows and Unix paths
		const separator = skillsBasePath.includes("\\") ? "\\" : "/";
		return `${skillsBasePath}${separator}${skill.folderName}${separator}${filename}`;
	};

	const getSkillFolderPath = () => {
		if (!skillsBasePath) return "";
		const separator = skillsBasePath.includes("\\") ? "\\" : "/";
		return `${skillsBasePath}${separator}${skill.folderName}`;
	};

	// All files: main file + additional files
	const allFiles = [skill.mainFile, ...skill.additionalFiles];

	return (
		<div className="border border-border rounded-lg p-3 bg-card hover:bg-accent/5 transition-colors">
			<div className="flex items-start gap-3">
				<div className="p-2 rounded-lg bg-primary/10">
					<Brain className="h-5 w-5 text-primary" />
				</div>

				<div className="flex-1 min-w-0">
					<h3 className="font-medium text-sm truncate">{skill.name}</h3>
					<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
						{skill.description}
					</p>

					{skill.dependencies && (
						<p className="text-xs text-muted-foreground mt-1">
							Requires: {skill.dependencies}
						</p>
					)}
				</div>
			</div>

			{/* Expandable Files Section */}
			<div className="mt-2">
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					aria-expanded={isExpanded}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
				>
					{isExpanded ? (
						<ChevronDown className="h-3 w-3" />
					) : (
						<ChevronRight className="h-3 w-3" />
					)}
					<span>
						{allFiles.length} file{allFiles.length > 1 ? "s" : ""}
					</span>
				</button>

				{isExpanded && (
					<div className="mt-2 space-y-1 pl-1">
						{/* Skill Folder Path */}
						<div className="flex items-center gap-1 group">
							<Folder className="h-3 w-3 text-muted-foreground flex-shrink-0" />
							<span className="text-xs text-muted-foreground truncate flex-1 font-mono">
								{skill.folderName}/
							</span>
							<button
								type="button"
								onClick={(e) => copyToClipboard(getSkillFolderPath(), e)}
								className={cn(
									"p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
									copiedPath === getSkillFolderPath()
										? "text-green-500"
										: "text-muted-foreground hover:text-foreground"
								)}
								title="Copy folder path"
							>
								{copiedPath === getSkillFolderPath() ? (
									<Check className="h-3 w-3" />
								) : (
									<Copy className="h-3 w-3" />
								)}
							</button>
						</div>

						{/* Individual Files */}
						{allFiles.map((filename) => {
							const filePath = getFilePath(filename);
							const isMain = filename === skill.mainFile;
							return (
								<div
									key={filename}
									className="flex items-center gap-1 group pl-3"
								>
									<FileText
										className={cn(
											"h-3 w-3 flex-shrink-0",
											isMain ? "text-primary" : "text-muted-foreground"
										)}
									/>
									<span className="text-xs text-muted-foreground truncate flex-1 font-mono">
										{filename}
									</span>
									<button
										type="button"
										onClick={(e) => copyToClipboard(filePath, e)}
										className={cn(
											"p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
											copiedPath === filePath
												? "text-green-500"
												: "text-muted-foreground hover:text-foreground"
										)}
										title="Copy file path"
									>
										{copiedPath === filePath ? (
											<Check className="h-3 w-3" />
										) : (
											<Copy className="h-3 w-3" />
										)}
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div className="flex gap-2 mt-3">
				{/* Split Button: Main action (Claude) + Dropdown for other options */}
				<div className="flex flex-1">
					<Button
						type="button"
						variant="default"
						size="sm"
						className="flex-1 rounded-r-none border-r-0"
						onClick={handleRunWithClaude}
					>
						<Play className="h-3 w-3 mr-1" />
						Run with Claude
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="default"
								size="sm"
								className="px-2 rounded-l-none border-l border-primary-foreground/20"
								aria-label="More run options"
							>
								<ChevronDown className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleRunWithCodex}>
								<Bot className="h-4 w-4 mr-2" />
								Run with Codex (OpenRouter)
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleRunWithGemini}>
								<Sparkles className="h-4 w-4 mr-2" />
								Run with Gemini CLI
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleDelete}
					aria-label="Delete skill"
				>
					<Trash2 className="h-3 w-3" />
				</Button>
			</div>
		</div>
	);
}
