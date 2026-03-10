"use client";

import { useState, useEffect, useCallback } from "react";
import { platform } from "@qcut/platform-core";
import { useSkillsStore } from "@/stores/skills-store";
import { useProjectStore } from "@/stores/project-store";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Folder, Brain, Loader2, Check, Package } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ImportSkillDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface AvailableSkill {
	path: string;
	name: string;
	description: string;
	bundled?: boolean;
}

/**
 * Displays a dialog allowing a user to import skills into the active project.
 *
 * Presents skills discovered in the user's .claude/skills folder, lets the user
 * browse for a custom skill folder, and imports the selected skill into the
 * currently active project while providing success/error feedback.
 *
 * @returns A React element rendering the Import Skill dialog UI
 */
export function ImportSkillDialog({
	open,
	onOpenChange,
}: ImportSkillDialogProps) {
	const { importSkill, skills: projectSkills } = useSkillsStore();
	const { activeProject } = useProjectStore();
	const [isLoading, setIsLoading] = useState(false);
	const [isScanning, setIsScanning] = useState(false);
	const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([]);

	const scanGlobalSkills = useCallback(async () => {
		setIsScanning(true);
		try {
			const skills = await platform().skills.scanGlobal();
			setAvailableSkills(skills);
		} catch {
			// Silently handle - global folder may not exist
		} finally {
			setIsScanning(false);
		}
	}, []);

	// Scan global skills when dialog opens
	useEffect(() => {
		if (open) {
			scanGlobalSkills();
		}
	}, [open, scanGlobalSkills]);

	const handleImport = async (skillPath: string, skillName: string) => {
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		setIsLoading(true);
		const skillId = await importSkill(activeProject.id, skillPath);
		setIsLoading(false);

		if (skillId) {
			toast.success(`Imported "${skillName}"`);
			onOpenChange(false);
		} else {
			toast.error("Failed to import skill", {
				description: "Make sure the folder contains a valid Skill.md file",
			});
		}
	};

	const handleBrowse = async () => {
		if (!activeProject) {
			toast.error("No active project", {
				description: "Please open a project first",
			});
			return;
		}

		let path: string | null = null;
		try {
			path = await platform().skills.browse();
		} catch {
			toast.error("Browse not available", {
				description: "This feature requires the Electron desktop app",
			});
			return;
		}

		if (path) {
			setIsLoading(true);
			try {
				const skillId = await importSkill(activeProject.id, path);

				if (skillId) {
					toast.success("Skill imported successfully");
					onOpenChange(false);
				} else {
					toast.error("Failed to import skill", {
						description: "Make sure the folder contains a valid Skill.md file",
					});
				}
			} finally {
				setIsLoading(false);
			}
		}
	};

	// Check if a skill is already imported in the project
	const isSkillImported = (skillPath: string) => {
		const folderName = skillPath.split(/[/\\]/).pop() || "";
		return projectSkills.some((s) => s.folderName === folderName);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Brain className="h-5 w-5 text-primary" />
						Import Skill
					</DialogTitle>
					<DialogDescription>
						Import skills from your .claude/skills folder or browse for a custom
						location.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Available skills from .claude/skills */}
					{isScanning ? (
						<div className="flex items-center justify-center py-6">
							<Loader2 className="h-5 w-5 animate-spin mr-2" />
							<span className="text-sm text-muted-foreground">
								Scanning .claude/skills...
							</span>
						</div>
					) : availableSkills.length > 0 ? (
						<div className="space-y-2">
							<h4 className="text-sm font-medium">
								Available Skills ({availableSkills.length})
							</h4>
							<ScrollArea className="h-[200px]">
								<div className="space-y-2 pr-4">
									{availableSkills.map((skill) => {
										const imported = isSkillImported(skill.path);
										return (
											<button
												key={skill.path}
												type="button"
												className={`w-full p-3 border rounded-lg text-left transition-colors ${
													imported
														? "bg-muted/30 border-muted cursor-default"
														: "hover:bg-accent/5 border-border"
												}`}
												onClick={() =>
													!imported && handleImport(skill.path, skill.name)
												}
												disabled={isLoading || imported || !activeProject}
											>
												<div className="flex items-center gap-2">
													<Brain className="h-4 w-4 text-primary flex-shrink-0" />
													<span className="font-medium text-sm truncate">
														{skill.name}
													</span>
													{skill.bundled && (
														<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 flex-shrink-0">
															<Package className="h-3 w-3" />
															Bundled
														</span>
													)}
													{imported && (
														<Check className="h-4 w-4 text-green-500 ml-auto flex-shrink-0" />
													)}
												</div>
												<p className="text-xs text-muted-foreground mt-1 line-clamp-2">
													{skill.description}
												</p>
												{imported && (
													<p className="text-xs text-green-600 mt-1">
														Already imported
													</p>
												)}
											</button>
										);
									})}
								</div>
							</ScrollArea>
						</div>
					) : (
						<div className="text-center py-4 text-muted-foreground">
							<Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
							<p className="text-sm">No skills found in .claude/skills</p>
							<p className="text-xs mt-1">
								Add skill folders to ~/.claude/skills/ or browse manually
							</p>
						</div>
					)}

					{/* Separator */}
					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<span className="w-full border-t" />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-background px-2 text-muted-foreground">
								or
							</span>
						</div>
					</div>

					{/* Browse button */}
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={handleBrowse}
						disabled={isLoading || !activeProject}
					>
						{isLoading ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Importing...
							</>
						) : (
							<>
								<Folder className="h-4 w-4 mr-2" />
								Browse for Skill Folder...
							</>
						)}
					</Button>

					{!activeProject && (
						<p className="text-xs text-destructive text-center">
							Please open a project to import skills
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
