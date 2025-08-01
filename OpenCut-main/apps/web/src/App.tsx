import React, { useEffect, useState } from 'react'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createMemoryHistory } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create router with memory history for Electron
const router = createRouter({
  routeTree,
  history: createMemoryHistory({
    initialEntries: ['/'],
  }),
  defaultPreload: 'intent',
  context: {},
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Small delay to ensure DOM and Electron environment is ready
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 100)

    return () => clearTimeout(timer)
  }, [])

  if (!isReady) {
    return <div className="flex items-center justify-center min-h-screen">Initializing...</div>
  }

  return (
    <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <RouterProvider router={router} />
    </React.Suspense>
  )
}

export default App