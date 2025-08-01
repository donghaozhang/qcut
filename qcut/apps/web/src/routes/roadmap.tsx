import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

export const Route = createFileRoute('/roadmap')({
  component: RoadmapPage,
})

function RoadmapPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Roadmap
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Our plans for the future of OpenCut.
          </p>
          <div className="prose prose-lg max-w-none">
            <p>Roadmap content will be added here.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}