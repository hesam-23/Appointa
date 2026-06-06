import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/app/lib/prisma"
import Link from "next/link"

export default async function AdminStaff() {
  const session = await auth()

  if (!session || session.user.role !== "ADMIN") {
    redirect("/")
  }

  const staff = await prisma.staff.findMany({
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
            <h1 className="text-4xl font-bold mt-1">Manage Staff</h1>
          </div>
          <Link
            href="/admin/staff/new"
            className="bg-zinc-900 text-white font-semibold px-6 py-3 rounded-full hover:bg-zinc-700 transition"
          >
            Add Staff
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          {staff.map((member) => (
            <div key={member.id} className="bg-white border border-zinc-200 rounded-2xl p-6 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold mb-1">{member.name}</h2>
                <p className="text-zinc-500 text-sm">{member.email}</p>
                <p className="text-zinc-400 text-sm mt-1">{member.bio}</p>
                <span className={`text-sm mt-1 inline-block ${member.isActive ? "text-green-600" : "text-red-500"}`}>
                  {member.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <Link
                href={`/admin/staff/${member.id}`}
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