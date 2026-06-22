import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { auth } from "@/app/lib/auth"
import { sendBookingConfirmation } from "@/app/lib/email"
import { createAuditLog } from "@/app/lib/audit"
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
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const startTime = new Date(body.startTime)
    const endTime = new Date(body.endTime)
    const conflict = await prisma.appointment.findFirst({
      where: {
        staffId: body.staffId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        OR: [
          {
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        ],
      },
    })
    if (conflict) {
      return NextResponse.json(
        { error: "This staff member is not available at the selected time" },
        { status: 409 }
      )
    }
    const appointment = await prisma.appointment.create({
      data: {
        startTime,
        endTime,
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
    await createAuditLog({
      action: "BOOK_APPOINTMENT",
      entity: "Appointment",
      entityId: appointment.id,
      details: `Booked ${appointment.service.name} with ${appointment.staff.name}`,
      userId: session.user.id,
    })
    let emailErrorMessage = null
    try {
      await sendBookingConfirmation({
        to: appointment.user.email,
        customerName: appointment.user.name,
        serviceName: appointment.service.name,
        staffName: appointment.staff.name,
        startTime: appointment.startTime,
      })
    } catch (emailError: any) {
      console.error("Failed to send email:", emailError)
      emailErrorMessage = emailError?.message || JSON.stringify(emailError)
    }
    return NextResponse.json({ ...appointment, emailError: emailErrorMessage }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create appointment" },
      { status: 500 }
    )
  }
}