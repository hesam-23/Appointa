import { prisma } from "@/app/lib/prisma"
import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import CancelButton from "@/app/components/CancelButton"

export default async function Appointments() {
  const session = await auth()

  if (!session) {
    redirect("/auth/login")
  }

  const appointments = await prisma.appointment.findMany({
    where: { userId: session.user.id },
    include: {
      service: true,
      staff: true,
    },
    orderBy: { startTime: "asc" },
  })

  return (
    <main className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-4xl font-bold">My Appointments</h1>
          <Link
            href="/booking"
            className="bg-zinc-900 text-white font-semibold px-6 py-3 rounded-full hover:bg-zinc-700 transition"
          >
            Book New
          </Link>
        </div>
        {appointments.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500 mb-4">No appointments yet</p>
            <Link href="/booking" className="text-zinc-900 font-semibold underline">
              Book your first appointment
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {appointments.map((apt) => (
              <div key={apt.id} className="border border-zinc-200 rounded-2xl p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{apt.service.name}</h2>
                    <p className="text-zinc-500 mb-1">with {apt.staff.name}</p>
                    <p className="text-zinc-400 text-sm">
                      {new Date(apt.startTime).toLocaleDateString()} at{" "}
                      {new Date(apt.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      apt.status === "SCHEDULED" ? "bg-blue-100 text-blue-700" :
                      apt.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                      apt.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                      "bg-zinc-100 text-zinc-700"
                    }`}>
                      {apt.status}
                    </span>
                    {apt.status === "SCHEDULED" && (
                      <CancelButton appointmentId={apt.id} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}