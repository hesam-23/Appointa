import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/app/lib/prisma"
import Link from "next/link"

export default async function AdminAppointments() {
  const session = await auth()

  if (!session || session.user.role !== "ADMIN") {
    redirect("/")
  }

  const appointments = await prisma.appointment.findMany({
    include: {
      user: true,
      staff: true,
      service: true,
    },
    orderBy: { startTime: "desc" },
  })

  return (
    <main className="min-h-screen bg-zinc-50 py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <Link href="/admin" className="text-zinc-500 text-sm hover:text-zinc-900 transition">
            Admin Panel
          </Link>
          <h1 className="text-4xl font-bold mt-1">All Appointments</h1>
        </div>
        {appointments.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500">No appointments yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {appointments.map((apt) => (
              <div key={apt.id} className="bg-white border border-zinc-200 rounded-2xl p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{apt.service.name}</h2>
                    <p className="text-zinc-500 text-sm">Customer: {apt.user.name}</p>
                    <p className="text-zinc-500 text-sm">Staff: {apt.staff.name}</p>
                    <p className="text-zinc-400 text-sm mt-1">
                      {new Date(apt.startTime).toLocaleDateString()} at{" "}
                      {new Date(apt.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    apt.status === "SCHEDULED" ? "bg-blue-100 text-blue-700" :
                    apt.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                    apt.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                    apt.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-700" :
                    "bg-zinc-100 text-zinc-700"
                  }`}>
                    {apt.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}