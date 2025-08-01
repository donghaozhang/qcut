import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

export const Route = createFileRoute('/why-not-capcut')({
  component: WhyNotCapcutPage,
})

function WhyNotCapcutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Why Not CapCut?
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Why choose OpenCut over CapCut and other video editors.
          </p>
          <div className="prose prose-lg max-w-none">
            <p>Comparison content will be added here.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}