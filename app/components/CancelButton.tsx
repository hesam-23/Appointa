"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function CancelButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel this appointment?")) return

    setLoading(true)

    const res = await fetch(`/api/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    })

    if (res.ok) {
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="text-red-500 text-sm hover:text-red-700 transition disabled:opacity-50"
    >
      {loading ? "Cancelling..." : "Cancel"}
    </button>
  )
}