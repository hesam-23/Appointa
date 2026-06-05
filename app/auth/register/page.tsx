import Link from "next/link"

export default function Register() {
  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-6">
      <div className="bg-white border border-zinc-200 rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8">Register</h1>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Full Name</label>
          <input
            type="text"
            placeholder="John Doe"
            className="w-full border border-zinc-300 rounded-lg px-4 py-3"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            className="w-full border border-zinc-300 rounded-lg px-4 py-3"
          />
        </div>
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full border border-zinc-300 rounded-lg px-4 py-3"
          />
        </div>
        <button className="w-full bg-zinc-900 text-white font-semibold py-3 rounded-full hover:bg-zinc-700 transition">
          Create Account
        </button>
        <p className="text-center text-zinc-500 mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-zinc-900 font-semibold">
            Login
          </Link>
        </p>
      </div>
    </main>
  )
}