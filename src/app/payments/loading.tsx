export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
        <div className="h-10 bg-gray-200 rounded w-56 sm:w-72"></div>
        <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
      </div>
      {[...Array(2)].map((_, gi) => (
        <div key={gi} className="mb-4">
          <div className="h-4 bg-gray-200 rounded w-20 mb-2 ml-1"></div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b">
              <div className="h-3 bg-gray-200 rounded w-24"></div>
            </div>
            {[...Array(4)].map((_, si) => (
              <div key={si} className="flex items-center gap-2 px-4 py-3 border-b last:border-b-0">
                <div className="h-4 bg-gray-200 rounded w-14 flex-1"></div>
                <div className="h-5 bg-gray-200 rounded-full w-16"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
