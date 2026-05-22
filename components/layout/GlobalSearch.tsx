'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Building2,
  CalendarCheck2,
  FileText,
  Search,
  Send,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFleetData } from '@/context/FleetDataContext';
import { getCompanies, getCompanyAssignments } from '@/lib/companies';
import { getDocuments } from '@/lib/documents';
import { mockDrivers, mockVehicles } from '@/lib/mock-data';
import type { Document } from '@/lib/types';

type SearchEntityType = 'driver' | 'vehicle' | 'company' | 'document' | 'assignment' | 'transport_request';

interface FleetAssignmentLike {
  id: string;
  date: string;
  driverName: string;
  vehicle: string;
  company: string;
  cargo: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string;
}

interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  name: string;
  subtitle: string;
  searchable: string[];
  relatedId?: string;
  route?: string;
  document?: Document;
  assignment?: FleetAssignmentLike;
}

function vehicleCodeFromId(vehicleId: string) {
  const match = vehicleId.match(/(\d{1,3})$/);
  if (!match) return vehicleId.toUpperCase();
  const numeric = Number(match[1]);
  if (Number.isNaN(numeric)) return vehicleId.toUpperCase();
  return `AP-${String(100 + numeric)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(value: string, query: string) {
  if (!query.trim()) return value;
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  const parts = value.split(regex);
  return parts.map((part, index) => {
    const isMatch = part.toLowerCase() === query.toLowerCase();
    if (!isMatch) return <span key={`${part}-${index}`}>{part}</span>;
    return (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-200/70 px-0.5 text-inherit">
        {part}
      </mark>
    );
  });
}

function resultIcon(type: SearchEntityType) {
  if (type === 'driver') return <User className="h-4 w-4 text-blue-600" />;
  if (type === 'vehicle') return <Truck className="h-4 w-4 text-indigo-600" />;
  if (type === 'company') return <Building2 className="h-4 w-4 text-emerald-600" />;
  if (type === 'document') return <FileText className="h-4 w-4 text-amber-600" />;
  if (type === 'assignment') return <CalendarCheck2 className="h-4 w-4 text-slate-700" />;
  return <Send className="h-4 w-4 text-violet-600" />;
}

function typeLabel(type: SearchEntityType) {
  if (type === 'driver') return 'Driver';
  if (type === 'vehicle') return 'Vehicle';
  if (type === 'company') return 'Company';
  if (type === 'document') return 'Document';
  if (type === 'assignment') return 'Assignment';
  return 'Transport Request';
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}

export function GlobalSearch() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { assignments, transportRequests, drivers } = useFleetData();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<FleetAssignmentLike | null>(null);

  const companies = useMemo(() => getCompanies(), []);
  const documents = useMemo(() => getDocuments(), []);

  const baseResults = useMemo<SearchResultItem[]>(() => {
    const driverItems: SearchResultItem[] = mockDrivers.map((driver) => {
      const fullName = `${driver.first_name} ${driver.last_name}`;
      return {
        id: `driver-${driver.id}`,
        type: 'driver',
        name: fullName,
        subtitle: driver.status.replace('_', ' '),
        searchable: [fullName, driver.phone ?? '', driver.email ?? ''],
        relatedId: driver.id,
        route: `/drivers/${driver.id}`,
      };
    });

    const vehicleItems: SearchResultItem[] = mockVehicles.map((vehicle) => {
      const currentDriver = vehicle.current_driver
        ? `${vehicle.current_driver.first_name} ${vehicle.current_driver.last_name}`
        : 'Unassigned';
      const vehicleCode = vehicleCodeFromId(vehicle.id);
      return {
        id: `vehicle-${vehicle.id}`,
        type: 'vehicle',
        name: vehicleCode,
        subtitle: `Current Driver: ${currentDriver}`,
        searchable: [vehicle.plate_number, vehicleCode, vehicle.brand, vehicle.model],
        relatedId: vehicle.id,
        route: `/vehicles/${vehicle.id}`,
      };
    });

    const companyItems: SearchResultItem[] = companies.map((company) => {
      const activeAssignments = getCompanyAssignments(company.id).filter(
        (item) => item.status === 'planned' || item.status === 'in_progress',
      ).length;
      return {
        id: `company-${company.id}`,
        type: 'company',
        name: company.name,
        subtitle: `${activeAssignments} Active Assignments`,
        searchable: [company.name, company.contactPerson ?? ''],
        relatedId: company.id,
        route: `/companies/${company.id}`,
      };
    });

    const documentItems: SearchResultItem[] = documents.map((document) => {
      const expires = document.expiryDate ? `Expires: ${document.expiryDate}` : 'No expiry date';
      return {
        id: `document-${document.id}`,
        type: 'document',
        name: document.documentType,
        subtitle: `${document.fileName} · ${expires}`,
        searchable: [document.fileName, document.documentType],
        relatedId: document.id,
        document,
      };
    });

    const assignmentItems: SearchResultItem[] = assignments.map((assignment) => {
      const driverName = drivers.find((item) => item.id === assignment.driverId)?.name ?? assignment.driverId;
      return {
        id: `assignment-${assignment.id}`,
        type: 'assignment',
        name: `${assignment.company} · ${assignment.vehicle}`,
        subtitle: `${driverName} · ${assignment.cargoName || assignment.routeJob || '-'} · ${assignment.date}`,
        searchable: [driverName, assignment.vehicle, assignment.company, assignment.cargoName ?? '', assignment.routeJob],
        relatedId: assignment.id,
        assignment: {
          id: assignment.id,
          date: assignment.date,
          driverName,
          vehicle: assignment.vehicle,
          company: assignment.company,
          cargo: assignment.cargoName ?? assignment.routeJob,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          status: assignment.status,
          notes: assignment.notes,
        },
      };
    });

    const requestItems: SearchResultItem[] = transportRequests.map((request) => {
      const driverName = request.driverId
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      return {
        id: `transport-${request.id}`,
        type: 'transport_request',
        name: `${request.companyId} · ${request.cargoName}`,
        subtitle: `${driverName} · ${request.pickupAddress} -> ${request.deliveryAddress}`,
        searchable: [driverName, request.companyId, request.cargoName],
        relatedId: request.id,
        route: '/assignments?panel=tagesplanung&view=daily-overview',
      };
    });

    return [...driverItems, ...vehicleItems, ...companyItems, ...documentItems, ...assignmentItems, ...requestItems];
  }, [assignments, companies, documents, drivers, transportRequests]);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (needle.length < 2) return [];

    return baseResults
      .filter((item) => item.searchable.some((value) => normalize(value).includes(needle)) || normalize(item.name).includes(needle))
      .slice(0, 10);
  }, [baseResults, query]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, []);

  function onInputChange(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    setOpen(value.trim().length >= 2);
  }

  function onSelect(item: SearchResultItem) {
    setOpen(false);

    if (item.type === 'document' && item.document) {
      setSelectedDocument(item.document);
      return;
    }

    if (item.type === 'assignment' && item.assignment) {
      setSelectedAssignment(item.assignment);
      return;
    }

    if (item.route) {
      router.push(item.route);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (selected) onSelect(selected);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
  }

  return (
    <>
      <div className="relative w-full max-w-[420px]" ref={wrapperRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onInputChange(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search drivers, vehicles, companies, documents..."
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          aria-label="Global search"
        />

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">No matches.</p>
            ) : (
              <ul className="max-h-[420px] overflow-y-auto py-1">
                {results.map((item, index) => {
                  const active = index === activeIndex;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className={`flex w-full items-start gap-3 px-3 py-2 text-left ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <span className="mt-1">{resultIcon(item.type)}</span>
                        <span className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{typeLabel(item.type)}</p>
                          <p className="truncate text-sm font-semibold text-slate-900">{highlightText(item.name, query)}</p>
                          <p className="truncate text-xs text-slate-600">{highlightText(item.subtitle, query)}</p>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {selectedDocument && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedDocument(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Document Detail Drawer</h3>
              <button
                type="button"
                onClick={() => setSelectedDocument(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close document drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm">
              <DetailRow label="Document Type" value={selectedDocument.documentType} />
              <DetailRow label="File Name" value={selectedDocument.fileName} />
              <DetailRow label="Owner" value={`${selectedDocument.ownerType} / ${selectedDocument.ownerId}`} />
              <DetailRow label="Status" value={selectedDocument.status} />
              <DetailRow label="Expiry" value={selectedDocument.expiryDate ?? '-'} />
              <DetailRow label="Uploaded At" value={selectedDocument.uploadedAt} />
            </div>
          </aside>
        </div>
      )}

      {selectedAssignment && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedAssignment(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Assignment Detail Drawer</h3>
              <button
                type="button"
                onClick={() => setSelectedAssignment(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close assignment drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm">
              <DetailRow label="Date" value={selectedAssignment.date} />
              <DetailRow label="Driver" value={selectedAssignment.driverName} />
              <DetailRow label="Vehicle" value={selectedAssignment.vehicle} />
              <DetailRow label="Company" value={selectedAssignment.company} />
              <DetailRow label="Cargo" value={selectedAssignment.cargo || '-'} />
              <DetailRow label="Start" value={selectedAssignment.startTime} />
              <DetailRow label="End" value={selectedAssignment.endTime} />
              <DetailRow label="Status" value={selectedAssignment.status} />
              <DetailRow label="Notes" value={selectedAssignment.notes || '-'} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[170px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}
