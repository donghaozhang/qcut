"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { HeaderBase } from "./header-base";

export function Header() {
  const leftContent = (
    <Link to="/" className="flex items-center gap-3">
      <img src="/logo.svg" alt="OpenCut Logo" width={32} height={32} />
      <span className="text-xl font-medium hidden md:block">OpenCut</span>
    </Link>
  );

  const rightContent = (
    <nav className="flex items-center gap-1">
      <div className="flex items-center gap-4">
        <Link to="/blog">
          <Button variant="text" className="text-sm p-0">
            Blog
          </Button>
        </Link>
        <Link to="/contributors">
          <Button variant="text" className="text-sm p-0">
            Contributors
          </Button>
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
