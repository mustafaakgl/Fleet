const items = [
  { label: 'Driver License — Jan Kowalski', days: 12, pct: 85, tone: 'bg-amber-500' },
  { label: 'Vehicle Inspection — DE-EF 9012', days: 28, pct: 62, tone: 'bg-blue-500' },
  { label: 'Insurance — DE-AB 1234', days: 45, pct: 40, tone: 'bg-emerald-500' },
  { label: 'Tachograph Calibration — DE-GH 3456', days: 7, pct: 95, tone: 'bg-red-500' },
];

export function CompliancePreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-950/10">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-slate-600">MyFleet — Compliance</span>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
          98% Compliant
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="rounded-xl bg-emerald-50 p-4 text-center">
          <p className="text-3xl font-bold text-emerald-700">98%</p>
          <p className="text-xs font-semibold text-emerald-600">Overall Score</p>
        </div>
        <div className="rounded-xl bg-red-50 p-4 text-center">
          <p className="text-3xl font-bold text-red-600">4</p>
          <p className="text-xs font-semibold text-red-500">Expiring Soon</p>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
              <span className="shrink-0 text-xs font-bold text-slate-500">{item.days}d</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${item.tone}`} style={{ width: `${item.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
