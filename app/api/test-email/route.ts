import { NextResponse } from "next/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET() {
  try {
    const result = await resend.emails.send({
      from: "Appointa <onboarding@resend.dev>",
      to: "en_concrete@yahoo.com",
      subject: "Test Email",
      html: "<h1>Test Email from Appointa</h1>",
    })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) })
  }
}