"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface StickersSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function StickersSearch({ searchQuery, onSearchChange }: StickersSearchProps) {
  return (
    <div className="border-b p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
        <Input
          placeholder="Search stickers..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <button
            type="button"
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 transform p-0 hover:bg-accent rounded"
            onClick={() => onSearchChange("")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}