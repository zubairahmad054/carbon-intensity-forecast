"use client"

import { useEffect } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

// Route-level error boundary: if any component in the dashboard throws during
// render, show this fallback instead of crashing the whole client tree.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The dashboard hit an unexpected error while rendering. It has been logged.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
