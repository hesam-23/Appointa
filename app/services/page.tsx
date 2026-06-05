import { prisma } from "@/app/lib/prisma"

export default async function Services() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  return (
    <main className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">Our Services</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service) => (
            <div key={service.id} className="border border-zinc-200 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-2">{service.name}</h2>
              <p className="text-zinc-500 mb-4">{service.description}</p>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">{service.duration} min</span>
                <span className="font-bold">${service.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}