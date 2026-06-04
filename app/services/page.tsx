export default function Services() {
  return (
    <main className="min-h-screen bg-white py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">Our Services</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-2">Haircut</h2>
            <p className="text-zinc-500 mb-4">Professional haircut by our experts</p>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">30 min</span>
              <span className="font-bold">$25</span>
            </div>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-2">Hair Coloring</h2>
            <p className="text-zinc-500 mb-4">Full hair coloring service</p>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">120 min</span>
              <span className="font-bold">$80</span>
            </div>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-2">Beard Trim</h2>
            <p className="text-zinc-500 mb-4">Shape and trim your beard</p>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">20 min</span>
              <span className="font-bold">$15</span>
            </div>
          </div>
          <div className="border border-zinc-200 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-2">Hair Wash</h2>
            <p className="text-zinc-500 mb-4">Deep cleanse and conditioning</p>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">30 min</span>
              <span className="font-bold">$20</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}