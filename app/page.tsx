export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-zinc-900 text-white py-24 px-6 text-center">
        <h1 className="text-5xl font-bold mb-4">Appointa</h1>
        <p className="text-xl text-zinc-400 mb-8">Online Salon Booking</p>
        <a href="/booking" className="bg-white text-zinc-900 font-semibold px-8 py-3 rounded-full">
          Book Now
        </a>
      </section>
      <section className="py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Our Services</h2>
        <a href="/services" className="border border-zinc-900 px-8 py-3 rounded-full">
          View Services
        </a>
      </section>
      <section className="bg-zinc-50 py-16 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Our Team</h2>
        <a href="/staff" className="border border-zinc-900 px-8 py-3 rounded-full">
          Meet the Team
        </a>
      </section>
    </main>
  )
}