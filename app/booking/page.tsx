import { prisma } from "@/app/lib/prisma"
import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import BookingForm from "@/app/components/BookingForm"

export default async function Booking() {
  const session = await auth()

  if (!session) {
    redirect("/auth/login")
  }

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  const staff = await prisma.staff.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  return (
    <main className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">Book Appointment</h1>
        <BookingForm services={services} staff={staff} userId={session.user.id} />
      </div>
    </main>
  )
}