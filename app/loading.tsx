export default function Loading() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-zinc-500">Loading...</p>
      </div>
    </main>
  )
}