"use client";

import { useEffect, useState } from "react";
import { useSkillsStore } from "@/stores/skills-store";
import { useProjectStore } from "@/stores/project-store";
import { SkillCard } from "../skill-card";
import { ImportSkillDialog } from "../import-skill-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Brain } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SkillsView() {
	const { skills, isLoading, loadSkills, deleteSkill } = useSkillsStore();
	const { activeProject } = useProjectStore();
	const [isImportOpen, setIsImportOpen] = useState(false);

	useEffect(() => {
		if (activeProject?.id) {
			loadSkills(activeProject.id);
		}
	}, [activeProject?.id, loadSkills]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{/* Header */}
			<div className="p-3 border-b border-border flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Brain className="h-4 w-4 text-primary" />
					<span className="font-medium text-sm">Skills</span>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setIsImportOpen(true)}
				>
					<Plus className="h-4 w-4 mr-1" />
					Import
				</Button>
			</div>

			{/* Skills List */}
			<ScrollArea className="flex-1">
				<div className="p-3 space-y-2">
					{skills.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
							<p className="text-sm">No skills in this project</p>
							<p className="text-xs mt-1">
								Import skills from .claude/skills folder
							</p>
						</div>
					) : (
						skills.map((skill) => (
							<SkillCard
								key={skill.id}
								skill={skill}
								onDelete={() => {
									if (activeProject) {
										deleteSkill(activeProject.id, skill.id);
									}
								}}
							/>
						))
					)}
				</div>
			</ScrollArea>

			<ImportSkillDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
		</div>
	);
}
