'use client';

import { useMemo, useState } from 'react';
import { Copy, Mail, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';

type Department =
  | 'Office'
  | 'Krage'
  | 'Raben Trans'
  | 'Weliver'
  | 'Go'
  | 'Kunzendorf'
  | 'Penny'
  | 'Securitas'
  | 'Werkstatt'
  | 'Netto'
  | 'Schnellecke'
  | 'Weidler'
  | 'Lidl';

type Role = 'Admin' | 'Manager' | 'Disponent' | 'Benutzer' | 'Fahrer';
type Language = 'Deutsch' | 'Turkisch' | 'Englisch' | 'Polnisch' | 'Franzosisch' | 'Italienisch' | 'Spanisch' | 'Niederlandisch';
type Workload = 'Vollzeit' | 'Teilzeit' | 'Minijob';
type UserStatus = 'Aktiv' | 'Inaktiv';
type DrawerMode = 'create' | 'copy' | 'edit';
type SortDirection = 'asc' | 'desc';

interface UserRecord {
  id: string;
  nachname: string;
  vorname: string;
  benutzername: string;
  mitarbeiterNr: string;
  email: string;
  telefonnummer: string;
  abteilung: Department;
  abteilungGueltigAb: string;
  benutzerrolle: Role;
  sprache: Language;
  workload: Workload;
  status: UserStatus;
}

interface UserFormData {
  nachname: string;
  vorname: string;
  benutzername: string;
  mitarbeiterNr: string;
  email: string;
  telefonnummer: string;
  abteilung: Department;
  abteilungGueltigAb: string;
  benutzerrolle: Role;
  sprache: Language;
  workload: Workload;
  status: UserStatus;
}

interface FilterState {
  nachname: string;
  vorname: string;
  benutzername: string;
  abteilung: string;
  benutzerrolle: string;
  sprache: string;
}

const departments: Department[] = [
  'Office',
  'Krage',
  'Raben Trans',
  'Weliver',
  'Go',
  'Kunzendorf',
  'Penny',
  'Securitas',
  'Werkstatt',
  'Netto',
  'Schnellecke',
  'Weidler',
  'Lidl',
];

const roles: Role[] = ['Admin', 'Manager', 'Disponent', 'Benutzer', 'Fahrer'];
const languages: Language[] = ['Deutsch', 'Turkisch', 'Englisch', 'Polnisch', 'Franzosisch', 'Italienisch', 'Spanisch', 'Niederlandisch'];
const workloads: Workload[] = ['Vollzeit', 'Teilzeit', 'Minijob'];
const userStatuses: UserStatus[] = ['Aktiv', 'Inaktiv'];

const initialUsers: UserRecord[] = [
  { id: '1001', nachname: 'Ahmed', vorname: 'Nevzat', benutzername: 'Nevzat', mitarbeiterNr: '1001', email: 'nevzat@fleet.com', telefonnummer: '+49 151 1001', abteilung: 'Penny', abteilungGueltigAb: '13.10.2025', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1002', nachname: 'Andreev', vorname: 'Andreas', benutzername: 'AndreasNeu', mitarbeiterNr: '1002', email: 'andreasneu@fleet.com', telefonnummer: '+49 151 1002', abteilung: 'Schnellecke', abteilungGueltigAb: '01.03.2026', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1003', nachname: 'Arican', vorname: 'Hasan', benutzername: 'Hasan', mitarbeiterNr: '1003', email: 'hasan@fleet.com', telefonnummer: '+49 151 1003', abteilung: 'Raben Trans', abteilungGueltigAb: '01.09.2021', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1004', nachname: 'Bach', vorname: 'Peter', benutzername: 'PeterB', mitarbeiterNr: '1004', email: 'peterb@fleet.com', telefonnummer: '+49 151 1004', abteilung: 'Raben Trans', abteilungGueltigAb: '01.10.2021', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Teilzeit', status: 'Aktiv' },
  { id: '1005', nachname: 'Baumeister', vorname: 'Lutz', benutzername: 'Lutz', mitarbeiterNr: '1005', email: 'lutz@fleet.com', telefonnummer: '+49 151 1005', abteilung: 'Werkstatt', abteilungGueltigAb: '01.11.2024', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1006', nachname: 'Cukur', vorname: 'Ilker', benutzername: 'Ilker', mitarbeiterNr: '1006', email: 'ilker@fleet.com', telefonnummer: '+49 151 1006', abteilung: 'Go', abteilungGueltigAb: '14.11.2025', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1007', nachname: 'Diallo', vorname: 'Sita', benutzername: 'Sita', mitarbeiterNr: '1007', email: 'sita@fleet.com', telefonnummer: '+49 151 1007', abteilung: 'Krage', abteilungGueltigAb: '01.05.2025', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1008', nachname: 'Dogan', vorname: 'Burcu', benutzername: 'Burcu', mitarbeiterNr: '1008', email: 'burcu@fleet.com', telefonnummer: '+49 151 1008', abteilung: 'Office', abteilungGueltigAb: '01.02.2026', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Teilzeit', status: 'Aktiv' },
  { id: '1009', nachname: 'Erdogan', vorname: 'Meryem', benutzername: 'manager', mitarbeiterNr: '1009', email: 'manager@fleet.com', telefonnummer: '+49 151 1009', abteilung: 'Office', abteilungGueltigAb: '02.07.2021', benutzerrolle: 'Manager', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1010', nachname: 'Feyzula', vorname: 'Nesrin', benutzername: 'Nesrin', mitarbeiterNr: '1010', email: 'nesrin@fleet.com', telefonnummer: '+49 151 1010', abteilung: 'Krage', abteilungGueltigAb: '01.10.2021', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
  { id: '1011', nachname: 'Gundrum', vorname: 'Andreas', benutzername: 'Andreas', mitarbeiterNr: '1011', email: 'andreas@fleet.com', telefonnummer: '+49 151 1011', abteilung: 'Krage', abteilungGueltigAb: '01.08.2021', benutzerrolle: 'Benutzer', sprache: 'Deutsch', workload: 'Vollzeit', status: 'Aktiv' },
];

const emptyForm: UserFormData = {
  nachname: '',
  vorname: '',
  benutzername: '',
  mitarbeiterNr: '',
  email: '',
  telefonnummer: '',
  abteilung: 'Office',
  abteilungGueltigAb: '',
  benutzerrolle: 'Benutzer',
  sprache: 'Deutsch',
  workload: 'Vollzeit',
  status: 'Aktiv',
};

function toInputDate(value: string) {
  const [day, month, year] = value.split('.');
  if (!day || !month || !year) return '';
  return `${year}-${month}-${day}`;
}

function toDisplayDate(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function statusBadgeClass(status: UserStatus) {
  return status === 'Aktiv'
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : 'border-rose-200 bg-rose-100 text-rose-700';
}

export function Benutzerverwaltung() {
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<FilterState>({
    nachname: '',
    vorname: '',
    benutzername: '',
    abteilung: '',
    benutzerrolle: '',
    sprache: '',
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const filteredUsers = useMemo(() => {
    const normalized = users.filter((user) => {
      return (
        user.nachname.toLowerCase().includes(filters.nachname.toLowerCase()) &&
        user.vorname.toLowerCase().includes(filters.vorname.toLowerCase()) &&
        user.benutzername.toLowerCase().includes(filters.benutzername.toLowerCase()) &&
        user.abteilung.toLowerCase().includes(filters.abteilung.toLowerCase()) &&
        user.benutzerrolle.toLowerCase().includes(filters.benutzerrolle.toLowerCase()) &&
        user.sprache.toLowerCase().includes(filters.sprache.toLowerCase())
      );
    });

    return normalized.sort((left, right) => {
      const result = left.nachname.localeCompare(right.nachname, 'de');
      return sortDirection === 'asc' ? result : -result;
    });
  }, [filters, sortDirection, users]);

  function openCreateDrawer() {
    setDrawerMode('create');
    setEditingUserId(null);
    setFormData(emptyForm);
    setDrawerOpen(true);
  }

  function openCopyDrawer() {
    if (!selectedUser) return;
    setDrawerMode('copy');
    setEditingUserId(null);
    setFormData({
      ...selectedUser,
      mitarbeiterNr: '',
      email: '',
    });
    setDrawerOpen(true);
  }

  function openEditDrawer(user: UserRecord) {
    setDrawerMode('edit');
    setEditingUserId(user.id);
    setFormData(user);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingUserId(null);
  }

  function saveUser() {
    const nextUser: UserRecord = {
      id: editingUserId ?? `${Date.now()}`,
      ...formData,
    };

    if (drawerMode === 'edit' && editingUserId) {
      setUsers((current) => current.map((user) => (user.id === editingUserId ? nextUser : user)));
      setSelectedUserId(nextUser.id);
    } else {
      setUsers((current) => [...current, nextUser]);
      setSelectedUserId(nextUser.id);
    }

    closeDrawer();
  }

  function sendWelcomeEmail() {
    if (!selectedUser) return;
    setToastMessage(`Willkommens-Email wurde an ${selectedUser.benutzername} gesendet.`);
    setTimeout(() => setToastMessage(null), 2500);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Benutzerverwaltung</h2>
        <p className="text-sm text-slate-600">ERP-style user administration with filters, row actions, and creation workflow.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-2 rounded-md border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <UserPlus className="h-4 w-4" />
            Neuen Benutzer anlegen
          </button>
          <button
            type="button"
            onClick={openCopyDrawer}
            disabled={!selectedUser}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-4 w-4 text-blue-600" />
            Benutzer kopieren
          </button>
          <button
            type="button"
            onClick={sendWelcomeEmail}
            disabled={!selectedUser}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mail className="h-4 w-4 text-blue-600" />
            Willkommens-Email senden
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1480px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600"
                  >
                    Nachname
                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  </button>
                </th>
                <th className="border-b border-slate-200 px-3 py-3">Vorname</th>
                <th className="border-b border-slate-200 px-3 py-3">Benutzername</th>
                <th className="border-b border-slate-200 px-3 py-3">Mitarbeiter-Nr.</th>
                <th className="border-b border-slate-200 px-3 py-3">Abteilung</th>
                <th className="border-b border-slate-200 px-3 py-3">Abteilung gültig ab</th>
                <th className="border-b border-slate-200 px-3 py-3">Benutzerrolle</th>
                <th className="border-b border-slate-200 px-3 py-3">Sprache</th>
                <th className="border-b border-slate-200 px-3 py-3">Vollzeit/Teilzeit</th>
                <th className="border-b border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3">Aktionen</th>
              </tr>
              <tr className="bg-white">
                <th className="border-b border-slate-200 px-3 py-2"><input value={filters.nachname} onChange={(event) => setFilters((current) => ({ ...current, nachname: event.target.value }))} placeholder="Filtern" className="h-8 w-full rounded border border-slate-300 px-2 text-xs" /></th>
                <th className="border-b border-slate-200 px-3 py-2"><input value={filters.vorname} onChange={(event) => setFilters((current) => ({ ...current, vorname: event.target.value }))} placeholder="Filtern" className="h-8 w-full rounded border border-slate-300 px-2 text-xs" /></th>
                <th className="border-b border-slate-200 px-3 py-2"><input value={filters.benutzername} onChange={(event) => setFilters((current) => ({ ...current, benutzername: event.target.value }))} placeholder="Filtern" className="h-8 w-full rounded border border-slate-300 px-2 text-xs" /></th>
                <th className="border-b border-slate-200 px-3 py-2" />
                <th className="border-b border-slate-200 px-3 py-2"><input value={filters.abteilung} onChange={(event) => setFilters((current) => ({ ...current, abteilung: event.target.value }))} placeholder="Filtern" className="h-8 w-full rounded border border-slate-300 px-2 text-xs" /></th>
                <th className="border-b border-slate-200 px-3 py-2" />
                <th className="border-b border-slate-200 px-3 py-2"><input value={filters.benutzerrolle} onChange={(event) => setFilters((current) => ({ ...current, benutzerrolle: event.target.value }))} placeholder="Filtern" className="h-8 w-full rounded border border-slate-300 px-2 text-xs" /></th>
                <th className="border-b border-slate-200 px-3 py-2"><input value={filters.sprache} onChange={(event) => setFilters((current) => ({ ...current, sprache: event.target.value }))} placeholder="Filtern" className="h-8 w-full rounded border border-slate-300 px-2 text-xs" /></th>
                <th className="border-b border-slate-200 px-3 py-2" />
                <th className="border-b border-slate-200 px-3 py-2" />
                <th className="border-b border-slate-200 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className={`border-t border-slate-100 ${selectedUserId === user.id ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-900">{user.nachname}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.vorname}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.benutzername}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.mitarbeiterNr}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.abteilung}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.abteilungGueltigAb}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.benutzerrolle}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.sprache}</td>
                  <td className="px-3 py-2.5 text-slate-700">{user.workload}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDrawer(user);
                        }}
                        className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                        aria-label="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedUserId(user.id);
                          setDrawerMode('copy');
                          setFormData({ ...user, mitarbeiterNr: '', email: '' });
                          setEditingUserId(null);
                          setDrawerOpen(true);
                        }}
                        className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                        aria-label="Copy user"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setUsers((current) => current.filter((item) => item.id !== user.id));
                          if (selectedUserId === user.id) setSelectedUserId(null);
                        }}
                        className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                        aria-label="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          {toastMessage}
        </div>
      )}

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/25" onClick={closeDrawer} />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {drawerMode === 'create' ? 'Neuen Benutzer anlegen' : drawerMode === 'copy' ? 'Benutzer kopieren' : 'Benutzer bearbeiten'}
              </h3>
              <button type="button" onClick={closeDrawer} className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close drawer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="text-slate-600">Nachname</span><input value={formData.nachname} onChange={(event) => setFormData((current) => ({ ...current, nachname: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Vorname</span><input value={formData.vorname} onChange={(event) => setFormData((current) => ({ ...current, vorname: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Benutzername</span><input value={formData.benutzername} onChange={(event) => setFormData((current) => ({ ...current, benutzername: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Mitarbeiter-Nr.</span><input value={formData.mitarbeiterNr} onChange={(event) => setFormData((current) => ({ ...current, mitarbeiterNr: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">E-Mail</span><input type="email" value={formData.email} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Telefonnummer</span><input value={formData.telefonnummer} onChange={(event) => setFormData((current) => ({ ...current, telefonnummer: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Abteilung</span><select value={formData.abteilung} onChange={(event) => setFormData((current) => ({ ...current, abteilung: event.target.value as Department }))} className="h-10 w-full rounded-md border border-slate-300 px-3">{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Abteilung gültig ab</span><input type="date" value={toInputDate(formData.abteilungGueltigAb)} onChange={(event) => setFormData((current) => ({ ...current, abteilungGueltigAb: toDisplayDate(event.target.value) }))} className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Benutzerrolle</span><select value={formData.benutzerrolle} onChange={(event) => setFormData((current) => ({ ...current, benutzerrolle: event.target.value as Role }))} className="h-10 w-full rounded-md border border-slate-300 px-3">{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Sprache</span><select value={formData.sprache} onChange={(event) => setFormData((current) => ({ ...current, sprache: event.target.value as Language }))} className="h-10 w-full rounded-md border border-slate-300 px-3">{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Vollzeit/Teilzeit</span><select value={formData.workload} onChange={(event) => setFormData((current) => ({ ...current, workload: event.target.value as Workload }))} className="h-10 w-full rounded-md border border-slate-300 px-3">{workloads.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1 text-sm"><span className="text-slate-600">Status</span><select value={formData.status} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value as UserStatus }))} className="h-10 w-full rounded-md border border-slate-300 px-3">{userStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button type="button" onClick={closeDrawer} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Abbrechen
              </button>
              <button type="button" onClick={saveUser} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                Benutzer speichern
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
