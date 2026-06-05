import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function GET() {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(services)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch services" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const service = await prisma.service.create({
      data: {
        name: body.name,
        description: body.description,
        duration: body.duration,
        price: body.price,
      },
    })
    return NextResponse.json(service, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create service" },
      { status: 500 }
    )
  }
}