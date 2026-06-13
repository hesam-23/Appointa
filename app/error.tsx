"use client"

import Link from "next/link"

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-zinc-200 mb-4">500</h1>
        <h2 className="text-3xl font-bold text-zinc-900 mb-4">Something Went Wrong</h2>
        <p className="text-zinc-500 mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="bg-zinc-900 text-white font-semibold px-8 py-3 rounded-full hover:bg-zinc-700 transition"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="border border-zinc-300 font-semibold px-8 py-3 rounded-full hover:bg-zinc-100 transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    </main>
  )
}