const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const assignments = [
  { driver: 'Ilker Ç.', route: 'Berlin → Hamburg', color: 'bg-blue-500' },
  { driver: 'Michael W.', route: 'Köln → Düsseldorf', color: 'bg-emerald-500' },
  { driver: 'Jan K.', route: 'Leave', color: 'bg-amber-400' },
  { driver: 'Marco R.', route: 'München → Augsburg', color: 'bg-violet-500' },
];

export function PlanningPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-950/10">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-slate-600">MyFleet — Einsatzplan</span>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
          Optimized
        </span>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 p-4">
        {days.map((day, i) => (
          <div key={day} className="bg-white p-2">
            <p className="text-center text-xs font-bold text-slate-500">{day}</p>
            {i < 4 && (
              <div
                className={`mt-2 rounded-md ${assignments[i].color} px-1.5 py-1 text-[10px] font-bold leading-tight text-white`}
              >
                {assignments[i].driver}
              </div>
            )}
            {i === 2 && (
              <div className="mt-1 rounded-md bg-amber-400 px-1.5 py-1 text-[10px] font-bold text-white">
                Jan K.
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-slate-100 p-4">
        {assignments.slice(0, 3).map((a) => (
          <div key={a.driver} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <div className={`h-2 w-2 rounded-full ${a.color}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{a.route}</p>
              <p className="text-xs text-slate-500">{a.driver}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
