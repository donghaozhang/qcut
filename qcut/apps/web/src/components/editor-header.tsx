"use client";

import { Button } from "./ui/button";
import { PanelView } from "@/types/panel";
import {
  ChevronDown,
  ArrowLeft,
  Download,
  SquarePen,
  Trash,
} from "lucide-react";
import { useTimelineStore } from "@/stores/timeline-store";
import { HeaderBase } from "./header-base";
import { formatTimeCode } from "@/lib/time";
import { useProjectStore } from "@/stores/project-store";
import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-help";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { RenameProjectDialog } from "./rename-project-dialog";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { FaDiscord, FaGithub } from "react-icons/fa6";
import { useExportStore } from "@/stores/export-store";

export function EditorHeader() {
  const { getTotalDuration } = useTimelineStore();
  const { activeProject, renameProject, deleteProject } = useProjectStore();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { setPanelView } = useExportStore();

  const handleExport = () => {
    setPanelView(PanelView.EXPORT);
  };

  const handleNameSave = async (newName: string) => {
    console.log("handleNameSave", newName);
    if (activeProject && newName.trim() && newName !== activeProject.name) {
      try {
        await renameProject(activeProject.id, newName.trim());
        setIsRenameDialogOpen(false);
      } catch (error) {
        console.error("Failed to rename project:", error);
      }
    }
  };

  const handleDelete = () => {
    if (activeProject) {
      deleteProject(activeProject.id);
      setIsDeleteDialogOpen(false);
      navigate({ to: "/projects" });
    }
  };

  const leftContent = (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="h-auto py-1.5 px-2.5 flex items-center justify-center"
          >
            <ChevronDown className="text-muted-foreground" />
            <span className="text-[0.85rem] mr-2">{activeProject?.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <Link to="/projects">
            <DropdownMenuItem className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem
            className="flex items-center gap-1.5"
            onClick={() => setIsRenameDialogOpen(true)}
          >
            <SquarePen className="h-4 w-4" />
            Rename project
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="flex items-center gap-1.5"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash className="h-4 w-4" />
            Delete Project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href="https://discord.gg/zmR9N35cjK"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <FaDiscord className="h-4 w-4" />
              Discord
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameProjectDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onConfirm={handleNameSave}
        projectName={activeProject?.name || ""}
      />
      <DeleteProjectDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        projectName={activeProject?.name || ""}
      />
    </div>
  );

  const centerContent = (
    <div className="flex items-center gap-2 text-xs">
      <span>
        {formatTimeCode(
          getTotalDuration(),
          "HH:MM:SS:FF",
          activeProject?.fps || 30
        )}
      </span>
    </div>
  );

  const rightContent = (
    <nav className="flex items-center gap-2">
      <KeyboardShortcutsHelp />
      <Button
        size="sm"
        className="h-7 text-xs !bg-linear-to-r from-cyan-400 to-blue-500 text-white hover:opacity-85 transition-opacity"
        onClick={handleExport}
      >
        <Download className="h-4 w-4" />
        <span className="text-sm">Export</span>
      </Button>
    </nav>
  );

  return (
    <HeaderBase
      leftContent={leftContent}
      centerContent={centerContent}
      rightContent={rightContent}
      className="bg-background h-[3.2rem] px-4 items-center"
    />
  );
}
