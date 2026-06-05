import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function GET() {
  try {
    const staff = await prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(staff)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const staff = await prisma.staff.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        bio: body.bio,
      },
    })
    return NextResponse.json(staff, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create staff" },
      { status: 500 }
    )
  }
}