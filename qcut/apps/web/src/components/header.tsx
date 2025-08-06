"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { HeaderBase } from "./header-base";

export function Header() {
  const leftContent = (
    <Link to="/" className="flex items-center gap-3">
      <img src="./logo.svg" alt="QCut Logo" width={32} height={32} />
      <span className="text-xl font-medium hidden md:block">QCut</span>
    </Link>
  );

  const rightContent = (
    <nav className="flex items-center gap-1">
      <div className="flex items-center gap-4">
        <Link
          to="/blog"
          className="text-sm p-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          Blog
        </Link>
        <Link
          to="/contributors"
          className="text-sm p-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          Contributors
        </Link>
      </div>
      <Link to="/projects">
        <Button size="sm" className="text-sm ml-4">
          Projects
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </nav>
  );

  return (
    <div className="mx-4 md:mx-0">
      <HeaderBase
        className="bg-accent border rounded-2xl max-w-3xl mx-auto mt-4 pl-4 pr-[14px]"
        leftContent={leftContent}
        rightContent={rightContent}
      />
    </div>
  );
}
