import React from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorageProvider } from "@/components/storage-provider";

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider attribute="class" forcedTheme="dark">
      <TooltipProvider>
        <StorageProvider>
          <Outlet />
          <Toaster />
        </StorageProvider>
      </TooltipProvider>
    </ThemeProvider>
  ),
  errorComponent: ({ error }) => (
    <div className="p-4">
      <h1>Something went wrong!</h1>
      <pre className="text-red-500">{error.message}</pre>
    </div>
  ),
});
