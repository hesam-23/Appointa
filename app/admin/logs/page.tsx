import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/app/lib/prisma"
import Link from "next/link"

export default async function AuditLogs() {
  const session = await auth()

  if (!session || session.user?.role !== "ADMIN") {
    redirect("/")
  }

  const logs = await prisma.auditLog.findMany({
    include: {
      user: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return (
    <main className="min-h-screen bg-zinc-50 py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <Link href="/admin" className="text-zinc-500 text-sm hover:text-zinc-900 transition">
            Admin Panel
          </Link>
          <h1 className="text-4xl font-bold mt-1">Audit Logs</h1>
        </div>
        {logs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500">No logs yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {logs.map((log) => (
              <div key={log.id} className="bg-white border border-zinc-200 rounded-2xl p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-zinc-900">{log.action}</span>
                    <span className="text-zinc-400 mx-2">—</span>
                    <span className="text-zinc-600">{log.details}</span>
                    <p className="text-zinc-400 text-sm mt-1">by {log.user.name}</p>
                  </div>
                  <p className="text-zinc-400 text-sm">
                    {new Date(log.createdAt).toLocaleDateString()} at{" "}
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}