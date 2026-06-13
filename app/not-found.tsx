import Link from "next/link"

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-zinc-200 mb-4">404</h1>
        <h2 className="text-3xl font-bold text-zinc-900 mb-4">Page Not Found</h2>
        <p className="text-zinc-500 mb-8">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="bg-zinc-900 text-white font-semibold px-8 py-3 rounded-full hover:bg-zinc-700 transition"
        >
          Go Home
        </Link>
      </div>
    </main>
  )
}