export default function Booking() {
  return (
    <main className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">Book Appointment</h1>
        <div className="border border-zinc-200 rounded-2xl p-8">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Service</label>
            <select className="w-full border border-zinc-300 rounded-lg px-4 py-3">
              <option>Haircut - 30 min - $25</option>
              <option>Hair Coloring - 120 min - $80</option>
              <option>Beard Trim - 20 min - $15</option>
              <option>Hair Wash - 30 min - $20</option>
            </select>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Staff</label>
            <select className="w-full border border-zinc-300 rounded-lg px-4 py-3">
              <option>Alex Johnson - Senior Stylist</option>
              <option>Sarah Williams - Color Specialist</option>
              <option>Mike Davis - Beard Specialist</option>
            </select>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Date</label>
            <input type="date" className="w-full border border-zinc-300 rounded-lg px-4 py-3" />
          </div>
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2">Select Time</label>
            <input type="time" className="w-full border border-zinc-300 rounded-lg px-4 py-3" />
          </div>
          <button className="w-full bg-zinc-900 text-white font-semibold py-3 rounded-full hover:bg-zinc-700 transition">
            Book Appointment
          </button>
        </div>
      </div>
    </main>
  )
}