import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendBookingConfirmation({
  to,
  customerName,
  serviceName,
  staffName,
  startTime,
}: {
  to: string
  customerName: string
  serviceName: string
  staffName: string
  startTime: Date
}) {
  const date = new Date(startTime).toLocaleDateString()
  const time = new Date(startTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  await resend.emails.send({
    from: "Appointa <onboarding@resend.dev>",
    to,
    subject: "Appointment Confirmed",
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h1 style="color: #18181b;">Appointment Confirmed</h1>
        <p>Hi ${customerName},</p>
        <p>Your appointment has been confirmed.</p>
        <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Staff:</strong> ${staffName}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${time}</p>
        </div>
        <p>See you soon!</p>
        <p>Appointa Team</p>
      </div>
    `,
  })
}

export async function sendCancellationEmail({
  to,
  customerName,
  serviceName,
  startTime,
}: {
  to: string
  customerName: string
  serviceName: string
  startTime: Date
}) {
  const date = new Date(startTime).toLocaleDateString()
  const time = new Date(startTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  await resend.emails.send({
    from: "Appointa <onboarding@resend.dev>",
    to,
    subject: "Appointment Cancelled",
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h1 style="color: #18181b;">Appointment Cancelled</h1>
        <p>Hi ${customerName},</p>
        <p>Your appointment has been cancelled.</p>
        <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${time}</p>
        </div>
        <p>Appointa Team</p>
      </div>
    `,
  })
}