import { PrismaClient } from "@prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { neonConfig } from "@neondatabase/serverless"
import bcrypt from "bcryptjs"
import ws from "ws"

neonConfig.webSocketConstructor = ws

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.appointment.deleteMany()
  await prisma.service.deleteMany()
  await prisma.staff.deleteMany()

  await prisma.service.create({
    data: {
      name: "Haircut",
      description: "Professional haircut by our experts",
      duration: 30,
      price: 25,
    },
  })

  await prisma.service.create({
    data: {
      name: "Hair Coloring",
      description: "Full hair coloring service",
      duration: 120,
      price: 80,
    },
  })

  await prisma.service.create({
    data: {
      name: "Beard Trim",
      description: "Shape and trim your beard",
      duration: 20,
      price: 15,
    },
  })

  await prisma.staff.create({
    data: {
      name: "Alex Johnson",
      email: "alex@appointa.com",
      bio: "Senior Stylist with 10 years experience",
    },
  })

  await prisma.staff.create({
    data: {
      name: "Sarah Williams",
      email: "sarah@appointa.com",
      bio: "Color Specialist",
    },
  })

  const adminExists = await prisma.user.findUnique({
    where: { email: "admin@appointa.com" },
  })

  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("admin12345678", 12)
    await prisma.user.create({
      data: {
        name: "Admin",
        email: "admin@appointa.com",
        password: hashedPassword,
        role: "ADMIN",
      },
    })
  }

  console.log("Seed data created successfully!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())