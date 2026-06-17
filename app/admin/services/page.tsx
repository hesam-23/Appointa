import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/app/lib/prisma"
import Link from "next/link"

export default async function AdminServices() {
  const session = await auth()

  if (!session || session.user?.role !== "ADMIN") {
    redirect("/")
  }

  const services = await prisma.service.findMany({
    orderBy: { name: "asc" },
  })

  return (
    <main className="min-h-screen bg-zinc-50 py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <Link href="/admin" className="text-zinc-500 text-sm hover:text-zinc-900 transition">
              Admin Panel
            </Link>
            <h1 className="text-4xl font-bold mt-1">Manage Services</h1>
          </div>
          <Link
            href="/admin/services/new"
            className="bg-zinc-900 text-white font-semibold px-6 py-3 rounded-full hover:bg-zinc-700 transition"
          >
            Add Service
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          {services.map((service) => (
            <div key={service.id} className="bg-white border border-zinc-200 rounded-2xl p-6 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold mb-1">{service.name}</h2>
                <p className="text-zinc-500 text-sm">{service.description}</p>
                <div className="flex gap-4 mt-2">
                  <span className="text-zinc-400 text-sm">{service.duration} min</span>
                  <span className="font-medium">${service.price}</span>
                  <span className={`text-sm ${service.isActive ? "text-green-600" : "text-red-500"}`}>
                    {service.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
              <Link
                href={`/admin/services/${service.id}`}
                className="border border-zinc-300 px-4 py-2 rounded-full text-sm hover:bg-zinc-100 transition"
              >
                Edit
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}