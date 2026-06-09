import type { FleetAssignment } from '@/context/FleetDataContext';
import { BRAND_BADGE_PLANNED, BRAND_COMPANY_HEADER_TONES } from '@/lib/brand-colors';

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

const boardCompanyDefs: Array<Omit<BoardCompany, 'headerClass'>> = [
  { key: 'dhl', label: 'DHL', aliases: ['dhl'] },
  { key: 'krage', label: 'Krage', aliases: ['krage'] },
  { key: 'ups', label: 'UPS', aliases: ['ups'] },
  { key: 'schnellecke', label: 'Schnellecke', aliases: ['schnellecke'] },
  { key: 'kunzendorf', label: 'Kunzendorf', aliases: ['kunzendorf'] },
  { key: 'raben', label: 'Raben', aliases: ['raben', 'raben trans'] },
  { key: 'weliver', label: 'Weliver', aliases: ['weliver'] },
  { key: 'penny', label: 'Penny', aliases: ['penny'] },
  { key: 'weidler', label: 'Weidler', aliases: ['weidler'] },
  {
    key: 'go-immanuel-klinikum',
    label: 'GO-Immanuel Klinikum',
    aliases: ['go-immanuel klinikum', 'go immanuel klinikum', 'immanuel klinikum', 'go'],
  },
  { key: 'securitas', label: 'Securitas', aliases: ['securitas'] },
  { key: 'amazon', label: 'Amazon', aliases: ['amazon'] },
  { key: 'hermes', label: 'Hermes', aliases: ['hermes'] },
];

export const BOARD_COMPANIES: BoardCompany[] = boardCompanyDefs.map((company, index) => ({
  ...company,
  headerClass: BRAND_COMPANY_HEADER_TONES[index % BRAND_COMPANY_HEADER_TONES.length],
}));

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
  if (status === 'Planned') return BRAND_BADGE_PLANNED;
  if (status === 'In Progress') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}
