import React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">OpenCut - Vite Migration</h1>
        <p className="text-lg text-muted-foreground mb-4">
          Successfully migrated from Next.js to Vite!
        </p>
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">Migration Status</h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Vite build system configured</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Tailwind CSS working</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>TypeScript configured</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>TanStack Router working</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  ),
})