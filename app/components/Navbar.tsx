import Link from "next/link"

export default function Navbar() {
  return (
    <nav className="bg-zinc-900 text-white px-6 py-4">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Appointa
        </Link>
        <div className="flex gap-6">
          <Link href="/services" className="hover:text-zinc-300 transition">
            Services
          </Link>
          <Link href="/staff" className="hover:text-zinc-300 transition">
            Staff
          </Link>
          <Link href="/booking" className="hover:text-zinc-300 transition">
            Book Now
          </Link>
          <Link href="/auth/login" className="hover:text-zinc-300 transition">
            Login
          </Link>
        </div>
      </div>
    </nav>
  )
}