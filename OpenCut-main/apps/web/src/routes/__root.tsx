import React from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StorageProvider } from '@/components/storage-provider'

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
})