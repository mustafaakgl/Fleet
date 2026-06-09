import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BRAND_BTN_PRIMARY } from '@/lib/brand-colors';
import { cn } from '@/lib/utils';
import type { EinsatzplanFilters } from './types';

interface FilterBarProps {
  filters: EinsatzplanFilters;
  companies: string[];
  vehicles: string[];
  onChange: (next: EinsatzplanFilters) => void;
}

export function FilterBar({ filters, companies, vehicles, onChange }: FilterBarProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Date</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...filters, dateMode: 'today' })}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-medium',
                filters.dateMode === 'today' ? BRAND_BTN_PRIMARY : 'bg-gray-100 text-gray-700',
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, dateMode: 'tomorrow' })}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-medium',
                filters.dateMode === 'tomorrow' ? BRAND_BTN_PRIMARY : 'bg-gray-100 text-gray-700',
              )}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, dateMode: 'custom' })}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-medium',
                filters.dateMode === 'custom' ? BRAND_BTN_PRIMARY : 'bg-gray-100 text-gray-700',
              )}
            >
              Custom
            </button>
          </div>
          {filters.dateMode === 'custom' && (
            <Input
              type="date"
              className="mt-2"
              value={filters.customDate}
              onChange={(e) => onChange({ ...filters, customDate: e.target.value })}
            />
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Department</p>
          <Select
            value={filters.department}
            onChange={(e) => onChange({ ...filters, department: e.target.value as EinsatzplanFilters['department'] })}
          >
            <option value="all">All</option>
            <option value="go">Go</option>
            <option value="krage">Krage</option>
            <option value="logistics">Logistics</option>
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Company</p>
          <Select value={filters.company} onChange={(e) => onChange({ ...filters, company: e.target.value })}>
            <option value="all">All</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Vehicle</p>
          <Select value={filters.vehicle} onChange={(e) => onChange({ ...filters, vehicle: e.target.value })}>
            <option value="all">All</option>
            {vehicles.map((plate) => (
              <option key={plate} value={plate}>
                {plate}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
          <Select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value as EinsatzplanFilters['status'] })}
          >
            <option value="all">All</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>
    </div>
  );
}
