import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/app/lib/prisma"
import Link from "next/link"

export default async function AdminPanel() {
  const session = await auth()

  if (!session || session.user.role !== "ADMIN") {
    redirect("/")
  }

  const servicesCount = await prisma.service.count()
  const staffCount = await prisma.staff.count()
  const appointmentsCount = await prisma.appointment.count()
  const scheduledCount = await prisma.appointment.count({
    where: { status: "SCHEDULED" },
  })

  return (
    <main className="min-h-screen bg-zinc-50 py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-12">Admin Panel</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2">{servicesCount}</p>
            <p className="text-zinc-500">Services</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2">{staffCount}</p>
            <p className="text-zinc-500">Staff</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2">{appointmentsCount}</p>
            <p className="text-zinc-500">Total Appointments</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-4xl font-bold mb-2">{scheduledCount}</p>
            <p className="text-zinc-500">Scheduled</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/admin/services" className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-zinc-400 transition">
            <h2 className="text-xl font-semibold mb-2">Manage Services</h2>
            <p className="text-zinc-500">Add, edit or remove services</p>
          </Link>
          <Link href="/admin/staff" className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-zinc-400 transition">
            <h2 className="text-xl font-semibold mb-2">Manage Staff</h2>
            <p className="text-zinc-500">Add, edit or remove staff members</p>
          </Link>
          <Link href="/admin/appointments" className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-zinc-400 transition">
            <h2 className="text-xl font-semibold mb-2">All Appointments</h2>
            <p className="text-zinc-500">View and manage all appointments</p>
          </Link>
        </div>
      </div>
    </main>
  )
}