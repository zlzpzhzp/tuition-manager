export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
      <div className="h-4 bg-gray-100 rounded w-56 mb-6"></div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4">
            <div className="h-3 bg-gray-200 rounded w-12 mb-3"></div>
            <div className="h-7 bg-gray-200 rounded w-20"></div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border p-5">
        <div className="h-4 bg-gray-200 rounded w-28 mb-4"></div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="h-4 bg-gray-200 rounded w-16 flex-1"></div>
              <div className="h-5 bg-gray-200 rounded-full w-12"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
