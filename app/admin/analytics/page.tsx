import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/app/lib/prisma"
import Link from "next/link"

export default async function Analytics() {
  const session = await auth()

if (!session || session.user?.role !== "ADMIN") {
    redirect("/")
  }

  const totalAppointments = await prisma.appointment.count()
  const completedAppointments = await prisma.appointment.count({
    where: { status: "COMPLETED" },
  })
  const cancelledAppointments = await prisma.appointment.count({
    where: { status: "CANCELLED" },
  })
  const scheduledAppointments = await prisma.appointment.count({
    where: { status: "SCHEDULED" },
  })

  const cancellationRate = totalAppointments > 0
    ? Math.round((cancelledAppointments / totalAppointments) * 100)
    : 0

  const topServices = await prisma.service.findMany({
    include: {
      _count: {
        select: { appointments: true },
      },
    },
    orderBy: {
      appointments: {
        _count: "desc",
      },
    },
    take: 5,
  })

  const topStaff = await prisma.staff.findMany({
    include: {
      _count: {
        select: { appointments: true },
      },
    },
    orderBy: {
      appointments: {
        _count: "desc",
      },
    },
    take: 5,
  })

  return (
    <main className="min-h-screen bg-zinc-50 py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <Link href="/admin" className="text-zinc-500 text-sm hover:text-zinc-900 transition">
            Admin Panel
          </Link>
          <h1 className="text-4xl font-bold mt-1">Analytics</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2">{totalAppointments}</p>
            <p className="text-zinc-500 text-sm">Total</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2 text-blue-600">{scheduledAppointments}</p>
            <p className="text-zinc-500 text-sm">Scheduled</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2 text-green-600">{completedAppointments}</p>
            <p className="text-zinc-500 text-sm">Completed</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2 text-red-500">{cancellationRate}%</p>
            <p className="text-zinc-500 text-sm">Cancellation Rate</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">Top Services</h2>
            <div className="flex flex-col gap-3">
              {topServices.map((service, index) => (
                <div key={service.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400 text-sm w-4">{index + 1}</span>
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <span className="bg-zinc-100 px-3 py-1 rounded-full text-sm">
                    {service._count.appointments} bookings
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6">Top Staff</h2>
            <div className="flex flex-col gap-3">
              {topStaff.map((member, index) => (
                <div key={member.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400 text-sm w-4">{index + 1}</span>
                    <span className="font-medium">{member.name}</span>
                  </div>
                  <span className="bg-zinc-100 px-3 py-1 rounded-full text-sm">
                    {member._count.appointments} bookings
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}