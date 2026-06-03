export function DriverManagementPreview() {
  const drivers = [
    { name: 'Ilker Çukur', plate: 'DE-AB 1234', status: 'Active', license: '2027-03', leave: '—' },
    { name: 'Michael Weber', plate: 'DE-CD 5678', status: 'On Route', license: '2026-08', leave: '—' },
    { name: 'Jan Kowalski', plate: 'DE-EF 9012', status: 'Leave', license: '2026-04', leave: 'Pending' },
    { name: 'Marco Rossi', plate: 'DE-GH 3456', status: 'Active', license: '2025-11', leave: '—' },
  ];

  const statusColor: Record<string, string> = {
    Active: 'bg-emerald-100 text-emerald-700',
    'On Route': 'bg-blue-100 text-blue-700',
    Leave: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-950/10">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <span className="text-sm font-semibold text-slate-600">MyFleet — Drivers</span>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
          128 Active
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-slate-100 p-4">
        {[
          ['128', 'Total Drivers'],
          ['3', 'License Expiring'],
          ['5', 'Leave Requests'],
        ].map(([val, label]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-2xl font-bold text-slate-950">{val}</p>
            <p className="text-xs font-medium text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Driver</th>
                <th className="hidden px-3 py-2.5 sm:table-cell">Vehicle</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="hidden px-3 py-2.5 md:table-cell">License</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map((d) => (
                <tr key={d.name} className="bg-white">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{d.name}</td>
                  <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">{d.plate}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusColor[d.status]}`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">{d.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
