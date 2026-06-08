import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in24HoursEnd = new Date(in24Hours.getTime() + 60 * 60 * 1000)

  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000)
  const in1HourEnd = new Date(in1Hour.getTime() + 60 * 60 * 1000)

  const appointments24h = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      startTime: {
        gte: in24Hours,
        lt: in24HoursEnd,
      },
    },
    include: {
      user: true,
      service: true,
      staff: true,
    },
  })

  const appointments1h = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      startTime: {
        gte: in1Hour,
        lt: in1HourEnd,
      },
    },
    include: {
      user: true,
      service: true,
      staff: true,
    },
  })

  let sent = 0

  for (const apt of appointments24h) {
    try {
      await resend.emails.send({
        from: "Appointa <onboarding@resend.dev>",
        to: apt.user.email,
        subject: "Reminder: Your appointment is tomorrow",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h1 style="color: #18181b;">Appointment Reminder</h1>
            <p>Hi ${apt.user.name},</p>
            <p>This is a reminder that you have an appointment tomorrow.</p>
            <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <p><strong>Service:</strong> ${apt.service.name}</p>
              <p><strong>Staff:</strong> ${apt.staff.name}</p>
              <p><strong>Date:</strong> ${new Date(apt.startTime).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${new Date(apt.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <p>See you soon!</p>
            <p>Appointa Team</p>
          </div>
        `,
      })
      sent++
    } catch (e) {
      console.error("Failed to send 24h reminder:", e)
    }
  }

  for (const apt of appointments1h) {
    try {
      await resend.emails.send({
        from: "Appointa <onboarding@resend.dev>",
        to: apt.user.email,
        subject: "Reminder: Your appointment is in 1 hour",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h1 style="color: #18181b;">Appointment Reminder</h1>
            <p>Hi ${apt.user.name},</p>
            <p>Your appointment is in 1 hour!</p>
            <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <p><strong>Service:</strong> ${apt.service.name}</p>
              <p><strong>Staff:</strong> ${apt.staff.name}</p>
              <p><strong>Time:</strong> ${new Date(apt.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <p>See you soon!</p>
            <p>Appointa Team</p>
          </div>
        `,
      })
      sent++
    } catch (e) {
      console.error("Failed to send 1h reminder:", e)
    }
  }

  return NextResponse.json({
    success: true,
    sent,
    checked: appointments24h.length + appointments1h.length,
  })
}