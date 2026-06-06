import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { auth } from "@/app/lib/auth"
import { sendCancellationEmail } from "@/app/lib/email"

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { status } = body

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      include: {
        user: true,
        service: true,
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    if (appointment.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updated = await prisma.appointment.update({
      where: { id: params.id },
      data: { status },
    })

    if (status === "CANCELLED") {
      try {
        await sendCancellationEmail({
          to: appointment.user.email,
          customerName: appointment.user.name,
          serviceName: appointment.service.name,
          startTime: appointment.startTime,
        })
      } catch (emailError) {
        console.error("Failed to send email:", emailError)
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update appointment" },
      { status: 500 }
    )
  }
}