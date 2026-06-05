import { PrismaClient } from "@prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { neonConfig } from "@neondatabase/serverless"
import ws from "ws"

neonConfig.webSocketConstructor = ws

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const service1 = await prisma.service.create({
    data: {
      name: "Haircut",
      description: "Professional haircut by our experts",
      duration: 30,
      price: 25,
    },
  })

  const service2 = await prisma.service.create({
    data: {
      name: "Hair Coloring",
      description: "Full hair coloring service",
      duration: 120,
      price: 80,
    },
  })

  const service3 = await prisma.service.create({
    data: {
      name: "Beard Trim",
      description: "Shape and trim your beard",
      duration: 20,
      price: 15,
    },
  })

  const staff1 = await prisma.staff.create({
    data: {
      name: "Alex Johnson",
      email: "alex@appointa.com",
      bio: "Senior Stylist with 10 years experience",
    },
  })

  const staff2 = await prisma.staff.create({
    data: {
      name: "Sarah Williams",
      email: "sarah@appointa.com",
      bio: "Color Specialist",
    },
  })

  console.log("Seed data created successfully!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())