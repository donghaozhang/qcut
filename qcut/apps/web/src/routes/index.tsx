import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Hero } from '@/components/landing/hero'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <Header />
      <Hero />
      <Footer />
    </div>
  )
}