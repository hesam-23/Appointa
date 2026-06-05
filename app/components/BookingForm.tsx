"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Service = {
  id: string
  name: string
  duration: number
  price: number
}

type Staff = {
  id: string
  name: string
  bio: string | null
}

type Props = {
  services: Service[]
  staff: Staff[]
  userId: string
}

export default function BookingForm({ services, staff, userId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)

    const form = e.currentTarget
    const serviceId = (form.elements.namedItem("serviceId") as HTMLSelectElement).value
    const staffId = (form.elements.namedItem("staffId") as HTMLSelectElement).value
    const date = (form.elements.namedItem("date") as HTMLInputElement).value
    const time = (form.elements.namedItem("time") as HTMLInputElement).value

    if (!serviceId || !staffId || !date || !time) {
      setError("Please fill in all fields")
      setLoading(false)
      return
    }

    const service = services.find((s) => s.id === serviceId)
    const startTime = new Date(`${date}T${time}`)
    const endTime = new Date(startTime.getTime() + (service?.duration || 30) * 60000)

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId,
        staffId,
        userId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error)
      setLoading(false)
      return
    }

    setSuccess("Appointment booked successfully!")
    setLoading(false)
    setTimeout(() => router.push("/appointments"), 2000)
  }

  return (
    <div className="border border-zinc-200 rounded-2xl p-8">
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select Service</label>
          <select name="serviceId" className="w-full border border-zinc-300 rounded-lg px-4 py-3">
            <option value="">Choose a service...</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.duration} min - ${service.price}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select Staff</label>
          <select name="staffId" className="w-full border border-zinc-300 rounded-lg px-4 py-3">
            <option value="">Choose a staff member...</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} - {member.bio}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select Date</label>
          <input name="date" type="date" className="w-full border border-zinc-300 rounded-lg px-4 py-3" />
        </div>
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Select Time</label>
          <input name="time" type="time" className="w-full border border-zinc-300 rounded-lg px-4 py-3" />
        </div>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        {success && <p className="text-green-500 text-sm mb-4">{success}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zinc-900 text-white font-semibold py-3 rounded-full hover:bg-zinc-700 transition disabled:opacity-50"
        >
          {loading ? "Booking..." : "Book Appointment"}
        </button>
      </form>
    </div>
  )
}