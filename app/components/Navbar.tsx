import Link from "next/link"
import { auth } from "@/app/lib/auth"
import { signOut } from "@/app/lib/auth"

export default async function Navbar() {
  const session = await auth()

  return (
    <nav className="bg-zinc-900 text-white px-6 py-4">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Appointa
        </Link>
        <div className="flex gap-6 items-center">
          <Link href="/services" className="hover:text-zinc-300 transition">
            Services
          </Link>
          <Link href="/staff" className="hover:text-zinc-300 transition">
            Staff
          </Link>
          <Link href="/booking" className="hover:text-zinc-300 transition">
            Book Now
          </Link>
          {session ? (
            <div className="flex gap-4 items-center">
              <span className="text-zinc-400 text-sm">{session.user?.name}</span>
              <form action={async () => {
                "use server"
                await signOut({ redirectTo: "/" })
              }}>
                <button type="submit" className="bg-zinc-700 px-4 py-2 rounded-full text-sm hover:bg-zinc-600 transition">
                  Logout
                </button>
              </form>
            </div>
          ) : (
            <Link href="/auth/login" className="hover:text-zinc-300 transition">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}