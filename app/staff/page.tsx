export default function Staff() {
  return (
    <main className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">Our Team</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-zinc-200 rounded-2xl p-6 text-center">
            <div className="w-20 h-20 bg-zinc-200 rounded-full mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-1">Alex Johnson</h2>
            <p className="text-zinc-500 text-sm">Senior Stylist</p>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-6 text-center">
            <div className="w-20 h-20 bg-zinc-200 rounded-full mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-1">Sarah Williams</h2>
            <p className="text-zinc-500 text-sm">Color Specialist</p>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-6 text-center">
            <div className="w-20 h-20 bg-zinc-200 rounded-full mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-1">Mike Davis</h2>
            <p className="text-zinc-500 text-sm">Beard Specialist</p>
          </div>
        </div>
      </div>
    </main>
  )
}