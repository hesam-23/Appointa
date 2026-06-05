import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function GET() {
  try {
    const appointments = await prisma.appointment.findMany({
      include: {
        user: true,
        staff: true,
        service: true,
      },
      orderBy: { startTime: "asc" },
    })
    return NextResponse.json(appointments)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch appointments" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const appointment = await prisma.appointment.create({
      data: {
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        userId: body.userId,
        staffId: body.staffId,
        serviceId: body.serviceId,
        notes: body.notes,
      },
      include: {
        user: true,
        staff: true,
        service: true,
      },
    })
    return NextResponse.json(appointment, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create appointment" },
      { status: 500 }
    )
  }
}