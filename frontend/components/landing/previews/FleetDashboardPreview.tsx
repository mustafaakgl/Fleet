export function FleetDashboardPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-950/10">
      <div className="flex">
        <div className="hidden w-14 shrink-0 flex-col gap-3 border-r border-slate-100 bg-[#002B5C] p-3 sm:flex">
          {['D', 'Dr', 'V', 'P', 'M'].map((icon, i) => (
            <div
              key={icon}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                i === 0 ? 'bg-[#0066CC] text-white' : 'text-blue-200'
              }`}
            >
              {icon}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-600">Operations Dashboard</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
              Live
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 p-3">
            {[
              ['128', 'Drivers'],
              ['94', 'Vehicles'],
              ['17', 'Requests'],
            ].map(([val, label]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-2.5 text-center">
                <p className="text-xl font-bold text-slate-950">{val}</p>
                <p className="text-[10px] font-semibold text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="mx-3 mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
            <p className="text-xs font-bold text-orange-800">⚠ 3 documents expiring within 30 days</p>
          </div>

          <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-slate-100">
            <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-500">
              Today&apos;s Operations
            </div>
            {[
              ['Ilker Çukur', 'Berlin → Hamburg', '08:00'],
              ['Michael Weber', 'Köln → Düsseldorf', '09:30'],
            ].map(([name, route, time]) => (
              <div
                key={name}
                className="flex items-center justify-between border-t border-slate-50 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-slate-800">{name}</span>
                <span className="text-slate-500">{route}</span>
                <span className="font-bold text-blue-600">{time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
