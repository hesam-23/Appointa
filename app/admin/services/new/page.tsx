"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function NewService() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const form = e.currentTarget
    const name = (form.elements.namedItem("name") as HTMLInputElement).value
    const description = (form.elements.namedItem("description") as HTMLInputElement).value
    const duration = (form.elements.namedItem("duration") as HTMLInputElement).value
    const price = (form.elements.namedItem("price") as HTMLInputElement).value

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        duration: parseInt(duration),
        price: parseFloat(price),
      }),
    })

    if (!res.ok) {
      setError("Failed to create service")
      setLoading(false)
      return
    }

    router.push("/admin/services")
  }

  return (
    <main className="min-h-screen bg-zinc-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/admin/services" className="text-zinc-500 text-sm hover:text-zinc-900 transition">
            Manage Services
          </Link>
          <h1 className="text-4xl font-bold mt-1">Add Service</h1>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-8">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Service Name</label>
              <input
                name="name"
                type="text"
                placeholder="e.g. Haircut"
                required
                className="w-full border border-zinc-300 rounded-lg px-4 py-3"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Description</label>
              <input
                name="description"
                type="text"
                placeholder="Brief description"
                className="w-full border border-zinc-300 rounded-lg px-4 py-3"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
              <input
                name="duration"
                type="number"
                placeholder="30"
                required
                className="w-full border border-zinc-300 rounded-lg px-4 py-3"
              />
            </div>
            <div className="mb-8">
              <label className="block text-sm font-medium mb-2">Price ($)</label>
              <input
                name="price"
                type="number"
                step="0.01"
                placeholder="25.00"
                required
                className="w-full border border-zinc-300 rounded-lg px-4 py-3"
              />
            </div>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-900 text-white font-semibold py-3 rounded-full hover:bg-zinc-700 transition disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Service"}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}