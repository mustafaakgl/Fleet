import type { FleetAssignment } from '@/context/FleetDataContext';

export interface BoardCompany {
  key: string;
  label: string;
  aliases: string[];
  headerClass: string;
}

export interface CompanyAssignmentGroup {
  company: {
    key: string;
    label: string;
    headerClass: string;
  };
  rows: FleetAssignment[];
}

export const BOARD_COMPANIES: BoardCompany[] = [
  { key: 'dhl', label: 'DHL', aliases: ['dhl'], headerClass: 'bg-yellow-50 text-yellow-900' },
  { key: 'krage', label: 'Krage', aliases: ['krage'], headerClass: 'bg-blue-50 text-blue-800' },
  { key: 'ups', label: 'UPS', aliases: ['ups'], headerClass: 'bg-amber-50 text-amber-800' },
  { key: 'schnellecke', label: 'Schnellecke', aliases: ['schnellecke'], headerClass: 'bg-cyan-50 text-cyan-800' },
  { key: 'kunzendorf', label: 'Kunzendorf', aliases: ['kunzendorf'], headerClass: 'bg-violet-50 text-violet-800' },
  { key: 'raben', label: 'Raben', aliases: ['raben', 'raben trans'], headerClass: 'bg-indigo-50 text-indigo-800' },
  { key: 'weliver', label: 'Weliver', aliases: ['weliver'], headerClass: 'bg-lime-50 text-lime-800' },
  { key: 'penny', label: 'Penny', aliases: ['penny'], headerClass: 'bg-yellow-50 text-yellow-800' },
  { key: 'weidler', label: 'Weidler', aliases: ['weidler'], headerClass: 'bg-slate-100 text-slate-800' },
  {
    key: 'go-immanuel-klinikum',
    label: 'GO-Immanuel Klinikum',
    aliases: ['go-immanuel klinikum', 'go immanuel klinikum', 'immanuel klinikum', 'go'],
    headerClass: 'bg-emerald-50 text-emerald-800',
  },
  { key: 'securitas', label: 'Securitas', aliases: ['securitas'], headerClass: 'bg-rose-50 text-rose-800' },
  { key: 'amazon', label: 'Amazon', aliases: ['amazon'], headerClass: 'bg-orange-50 text-orange-800' },
  { key: 'hermes', label: 'Hermes', aliases: ['hermes'], headerClass: 'bg-teal-50 text-teal-800' },
];

export const TRAILER_BY_VEHICLE: Record<string, string> = {
  N165: '1734',
  N119: '1572',
  BSG693: '1740',
  AP101: '1733',
  AP102: '1567',
  AP104: '1745',
  AP105: '1711',
};

const boardOrderIndex = new Map(BOARD_COMPANIES.map((company, index) => [company.key, index]));

export function normalizeCompany(value: string) {
  return value.trim().toLowerCase();
}

export function resolveCompanyBoardMeta(companyName: string) {
  const normalized = normalizeCompany(companyName);
  const board = BOARD_COMPANIES.find((company) =>
    company.aliases.some((alias) => normalized === alias || normalized.includes(alias)),
  );

  if (board) {
    return {
      key: board.key,
      label: board.label,
      headerClass: board.headerClass,
    };
  }

  const label = companyName.trim() || 'Unassigned';
  return {
    key: normalized.replace(/\s+/g, '-') || 'unassigned',
    label,
    headerClass: 'bg-slate-100 text-slate-800',
  };
}

export function groupAssignmentsByCompany(assignments: FleetAssignment[]): CompanyAssignmentGroup[] {
  const grouped = new Map<string, CompanyAssignmentGroup>();

  for (const assignment of assignments) {
    const companyName = assignment.company?.trim() || 'Unassigned';
    const companyKey = normalizeCompany(companyName) || 'unassigned';

    if (!grouped.has(companyKey)) {
      const meta = resolveCompanyBoardMeta(companyName);
      grouped.set(companyKey, {
        company: meta,
        rows: [],
      });
    }

    grouped.get(companyKey)!.rows.push(assignment);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .sort((a, b) => {
      const aIndex = boardOrderIndex.get(a.company.key) ?? 999;
      const bIndex = boardOrderIndex.get(b.company.key) ?? 999;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.company.label.localeCompare(b.company.label, 'de');
    });
}

export function assignmentStatusBadge(status: string) {
  if (status === 'Planned') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'In Progress') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}
