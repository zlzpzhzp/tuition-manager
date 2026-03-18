export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-32 mb-6"></div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-100 rounded w-8"></div>
          </div>
          <div className="space-y-2">
            {[...Array(2)].map((_, j) => (
              <div key={j} className="h-10 bg-gray-50 rounded-lg"></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
