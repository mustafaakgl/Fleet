'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DocumentActionsMenu } from '@/components/documents/DocumentActionsMenu';
import { DocumentImportDialog } from '@/components/documents/DocumentImportDialog';
import { documentsApi, driversApi, vehiclesApi, companiesApi, type MissingDocumentRow } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { downloadDocumentsCsv } from '@/lib/documents-csv';
import { canImportCsv } from '@/lib/permissions';
import type { Document, Driver, Vehicle, Company } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { documentHasFile, openAuthenticatedDocument } from '@/lib/file-access';
import {
  FLEET_LINK_ACTION,
  FLEET_LIST_CARD,
  FLEET_LIST_DESKTOP,
  FLEET_LIST_MOBILE,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW_CLICKABLE,
} from '@/lib/fleet-table';
import { MobileDataCard, MobileField, MobileFieldGrid } from '@/components/ui/MobileDataCard';
import { cn, formatDate } from '@/lib/utils';

const OWNER_TYPES: Array<Document['ownerType']> = [
  'driver',
  'vehicle',
  'company',
  'request',
  'accident',
  'cargo_damage',
];

const DOCUMENT_TYPES_BY_OWNER: Record<Document['ownerType'], string[]> = {
  driver: ['Driving License', 'Passport', 'Contract', 'Sick Note', 'Salary Document'],
  vehicle: ['TUV', 'SP', 'Registration', 'Insurance', 'Service Report'],
  company: ['Contract', 'Price Agreement', 'Contact Form'],
  request: ['Request Attachment'],
  accident: ['Accident Report'],
  cargo_damage: ['Cargo Damage Report'],
  service_record: ['Receipt', 'Photo', 'Service Document'],
};

type DocumentRow =
  | { kind: 'real'; doc: Document }
  | { kind: 'missing'; row: MissingDocumentRow };

type DrawerMode = 'add' | 'edit' | 'replace';

function badgeClass(status: Document['status']) {
  if (status === 'valid') return 'bg-emerald-100 text-emerald-700';
  if (status === 'expiring_soon') return 'bg-amber-100 text-amber-700';
  if (status === 'expired') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

export default function DocumentsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [missing, setMissing] = useState<MissingDocumentRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [ownerTypeFilter, setOwnerTypeFilter] = useState<'all' | Document['ownerType']>('all');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Document['status']>(() => {
    const statusParam = searchParams.get('status');
    if (
      statusParam === 'valid' ||
      statusParam === 'expiring_soon' ||
      statusParam === 'expired' ||
      statusParam === 'missing' ||
      statusParam === 'archived'
    ) {
      return statusParam;
    }
    return 'all';
  });
  const [search, setSearch] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDocument, setDetailDocument] = useState<Document | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<DrawerMode>('add');
  const [formDocument, setFormDocument] = useState<Document | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const user = getUser();
  const canImport = canImportCsv(user?.role ?? 'customer');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, miss, drv, veh, cmp] = await Promise.all([
        documentsApi.list({}),
        documentsApi.getMissingRequired().catch(() => [] as MissingDocumentRow[]),
        driversApi.list({ limit: 200 }),
        vehiclesApi.list({ limit: 200 }),
        companiesApi.list({ limit: 200 }),
      ]);
      setDocuments(docs);
      setMissing(miss);
      setDrivers(drv.data);
      setVehicles(veh.data);
      setCompanies(cmp.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const ownerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(`driver:${d.id}`, `${d.first_name} ${d.last_name}`);
    for (const v of vehicles) map.set(`vehicle:${v.id}`, v.plate_number);
    for (const c of companies) map.set(`company:${c.id}`, c.name);
    return map;
  }, [drivers, vehicles, companies]);

  function ownerName(ownerType: string, ownerId: string): string {
    return ownerNameMap.get(`${ownerType}:${ownerId}`) ?? ownerId;
  }

  function ownerOptionsByType(ot: Document['ownerType']) {
    if (ot === 'driver') return drivers.map((d) => ({ id: d.id, label: `${d.first_name} ${d.last_name}` }));
    if (ot === 'vehicle') return vehicles.map((v) => ({ id: v.id, label: v.plate_number }));
    if (ot === 'company') return companies.map((c) => ({ id: c.id, label: c.name }));
    return [];
  }

  const combined: DocumentRow[] = useMemo(() => {
    const out: DocumentRow[] = documents.map((doc) => ({ kind: 'real', doc }));
    for (const row of missing) {
      out.push({ kind: 'missing', row });
    }
    return out;
  }, [documents, missing]);

  const filtered = useMemo(() => {
    const statusQuery = searchParams.get('status');
    const statusValues = statusQuery ? statusQuery.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const q = search.trim().toLowerCase();

    return combined.filter((entry) => {
      const ot = entry.kind === 'real' ? entry.doc.ownerType : entry.row.owner_type;
      const dt = entry.kind === 'real' ? entry.doc.documentType : entry.row.document_type;
      const status: Document['status'] = entry.kind === 'real' ? entry.doc.status : 'missing';
      const ownerNameStr =
        entry.kind === 'real'
          ? ownerName(entry.doc.ownerType, entry.doc.ownerId)
          : entry.row.owner_name;
      const fileName = entry.kind === 'real' ? entry.doc.fileName : '';

      const ownerTypePass = ownerTypeFilter === 'all' || ot === ownerTypeFilter;
      const docTypePass = documentTypeFilter === 'all' || dt === documentTypeFilter;
      const statusPass =
        statusValues.length > 0
          ? statusValues.includes(status)
          : statusFilter === 'all' || status === statusFilter;

      const searchPass =
        !q ||
        ownerNameStr.toLowerCase().includes(q) ||
        fileName.toLowerCase().includes(q) ||
        dt.toLowerCase().includes(q);

      return ownerTypePass && docTypePass && statusPass && searchPass;
    });
  }, [combined, ownerTypeFilter, documentTypeFilter, statusFilter, search, searchParams, ownerNameMap]);

  const availableTypes = useMemo(() => {
    const values = new Set<string>();
    for (const e of combined) {
      values.add(e.kind === 'real' ? e.doc.documentType : e.row.document_type);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [combined]);

  function openDetail(doc: Document) {
    setDetailDocument(doc);
    setDetailOpen(true);
  }

  async function openFileIfAvailable(doc: Document) {
    if (!documentHasFile(doc)) return false;
    try {
      await openAuthenticatedDocument(doc.id, doc.fileName);
      return true;
    } catch {
      return false;
    }
  }

  async function openDocument(doc: Document) {
    const opened = await openFileIfAvailable(doc);
    if (!opened) {
      openDetail(doc);
    }
  }

  function handleExport() {
    if (documents.length === 0) return;
    downloadDocumentsCsv(documents, ownerNameMap);
  }

  function openForm(mode: DrawerMode, doc?: Document, missingRow?: MissingDocumentRow) {
    setFormMode(mode);
    if (doc) {
      setFormDocument(doc);
    } else if (missingRow) {
      // Pre-fill add form from missing row
      setFormDocument({
        id: '',
        ownerType: missingRow.owner_type,
        ownerId: missingRow.owner_id,
        documentType: missingRow.document_type,
        fileName: '',
        uploadedAt: '',
        status: 'missing',
      });
    } else {
      setFormDocument(null);
    }
    setFormOpen(true);
  }

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Delete ${doc.documentType} (${doc.fileName})?`)) return;
    try {
      await documentsApi.remove(doc.id);
      await reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  async function handleSubmitForm(payload: {
    ownerType: Document['ownerType'];
    ownerId: string;
    documentType: string;
    fileName: string;
    expiryDate?: string;
    notes?: string;
    file?: File | null;
  }) {
    setSaving(true);
    try {
      if (formMode === 'add') {
        if (payload.file) {
          const formData = new FormData();
          formData.append('ownerType', payload.ownerType);
          formData.append('ownerId', payload.ownerId);
          formData.append('documentType', payload.documentType);
          if (payload.expiryDate) formData.append('expiryDate', payload.expiryDate);
          if (payload.notes) formData.append('notes', payload.notes);
          formData.append('file', payload.file);
          await documentsApi.upload(formData);
          setToast({ type: 'success', message: 'Document uploaded successfully.' });
        } else {
          await documentsApi.create({
            ownerType: payload.ownerType,
            ownerId: payload.ownerId,
            documentType: payload.documentType,
            fileName: payload.fileName,
            expiryDate: payload.expiryDate,
            notes: payload.notes,
          });
          setToast({ type: 'success', message: 'Document metadata saved.' });
        }
      } else if (formMode === 'edit' && formDocument?.id) {
        if (payload.file) {
          const formData = new FormData();
          formData.append('documentType', payload.documentType);
          if (payload.expiryDate) formData.append('expiryDate', payload.expiryDate);
          if (payload.notes) formData.append('notes', payload.notes);
          formData.append('file', payload.file);
          await documentsApi.replaceUpload(formDocument.id, formData);
          setToast({ type: 'success', message: 'Document updated with new file.' });
        } else {
          await documentsApi.update(formDocument.id, {
            documentType: payload.documentType,
            fileName: payload.fileName,
            expiryDate: payload.expiryDate,
            notes: payload.notes,
          });
          setToast({ type: 'success', message: 'Document updated.' });
        }
      } else if (formMode === 'replace' && formDocument?.id) {
        if (payload.file) {
          const formData = new FormData();
          if (payload.documentType) formData.append('documentType', payload.documentType);
          if (payload.expiryDate) formData.append('expiryDate', payload.expiryDate);
          if (payload.notes) formData.append('notes', payload.notes);
          formData.append('file', payload.file);
          await documentsApi.replaceUpload(formDocument.id, formData);
          setToast({ type: 'success', message: 'Document replaced with uploaded file.' });
        } else {
          await documentsApi.replace(formDocument.id, {
            fileName: payload.fileName,
            expiryDate: payload.expiryDate,
            notes: payload.notes,
          });
          setToast({ type: 'success', message: 'Document metadata replaced.' });
        }
      }
      setFormOpen(false);
      await reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save';
      window.alert(message);
      setToast({ type: 'error', message: `Upload failed: ${message}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('documents.title')}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DocumentActionsMenu
            canImport={canImport}
            onImport={() => setImportOpen(true)}
            onExport={handleExport}
          />
          <Button onClick={() => openForm('add')}>
            <Plus className="mr-1 h-4 w-4" />
            {t('documents.addDocument')}
          </Button>
        </div>
      </div>

      <DocumentImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void reload()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('documents.filters')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Select
              value={ownerTypeFilter}
              onChange={(e) => setOwnerTypeFilter(e.target.value as 'all' | Document['ownerType'])}
            >
              <option value="all">{t('documents.ownerType')}: All</option>
              {OWNER_TYPES.map((ownerType) => (
                <option key={ownerType} value={ownerType}>
                  {ownerType}
                </option>
              ))}
            </Select>

            <Select
              value={documentTypeFilter}
              onChange={(e) => setDocumentTypeFilter(e.target.value)}
            >
              <option value="all">{t('documents.documentType')}: All</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | Document['status'])}
            >
              <option value="all">{t('common.status')}: All</option>
              <option value="valid">valid</option>
              <option value="expiring_soon">expiring_soon</option>
              <option value="expired">expired</option>
              <option value="missing">missing</option>
              <option value="archived">archived</option>
            </Select>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
            />
          </div>
        </CardContent>
      </Card>

      <Card className={FLEET_LIST_CARD}>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title="Failed to load documents"
              subtitle={error}
              actionLabel="Retry"
              onAction={reload}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title="No documents found"
              subtitle="No documents match current filters."
              actionLabel="Upload Document"
              onAction={() => openForm('add')}
            />
          </div>
        ) : (
          <>
          <div className={FLEET_LIST_MOBILE}>
            {filtered.map((entry) => {
              if (entry.kind === 'missing') {
                return (
                  <MobileDataCard
                    key={`missing-${entry.row.owner_type}-${entry.row.owner_id}-${entry.row.document_type}`}
                    title={entry.row.document_type}
                    subtitle={`${entry.row.owner_type} · ${entry.row.owner_name}`}
                    badge={<Badge className={badgeClass('missing')}>missing</Badge>}
                    actions={
                      <button type="button" className={FLEET_LINK_ACTION} onClick={() => openForm('add', undefined, entry.row)}>
                        Upload
                      </button>
                    }
                  />
                );
              }
              const doc = entry.doc;
              return (
                <MobileDataCard
                  key={doc.id}
                  title={doc.documentType}
                  subtitle={`${doc.ownerType} · ${ownerName(doc.ownerType, doc.ownerId)}`}
                  badge={<Badge className={badgeClass(doc.status)}>{doc.status}</Badge>}
                  onClick={() => void openDocument(doc)}
                >
                  <MobileFieldGrid>
                    <MobileField label={t('documents.fileName')} value={doc.fileName} />
                    <MobileField label={t('documents.expiryDate')} value={formatDate(doc.expiryDate)} />
                  </MobileFieldGrid>
                </MobileDataCard>
              );
            })}
          </div>
          <div className={cn(FLEET_LIST_DESKTOP, FLEET_TABLE_SCROLL)}>
            <Table className={FLEET_TABLE}>
              <TableHeader>
                <TableRow className={FLEET_TABLE_HEADER_ROW}>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('documents.ownerType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('documents.ownerName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('documents.documentType')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('documents.fileName')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('documents.expiryDate')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('common.status')}</TableHead>
                  <TableHead className={FLEET_TABLE_HEAD}>{t('documents.uploadedAt')}</TableHead>
                  <TableHead className={cn(FLEET_TABLE_HEAD, 'w-36')} />
                </TableRow>
              </TableHeader>
              <TableBody className={FLEET_TABLE_BODY}>
                {filtered.map((entry) => {
                  if (entry.kind === 'missing') {
                    return (
                      <TableRow key={`missing-${entry.row.owner_type}-${entry.row.owner_id}-${entry.row.document_type}`}>
                        <TableCell className={cn(FLEET_TABLE_CELL, 'capitalize')}>{entry.row.owner_type}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>{entry.row.owner_name}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>{entry.row.document_type}</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>—</TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>—</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <Badge className={badgeClass('missing')}>missing</Badge>
                        </TableCell>
                        <TableCell className={FLEET_TABLE_CELL_MUTED}>—</TableCell>
                        <TableCell className={FLEET_TABLE_CELL}>
                          <button
                            type="button"
                            className={FLEET_LINK_ACTION}
                            onClick={() => openForm('add', undefined, entry.row)}
                          >
                            Upload
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const doc = entry.doc;
                  return (
                    <TableRow
                      key={doc.id}
                      className={FLEET_TABLE_ROW_CLICKABLE}
                      onClick={() => void openDocument(doc)}
                    >
                      <TableCell className={cn(FLEET_TABLE_CELL, 'capitalize')}>{doc.ownerType}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>
                        {ownerName(doc.ownerType, doc.ownerId)}
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>{doc.documentType}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>{doc.fileName}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatDate(doc.expiryDate)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL}>
                        <Badge className={badgeClass(doc.status)}>{doc.status}</Badge>
                      </TableCell>
                      <TableCell className={FLEET_TABLE_CELL_MUTED}>{formatDate(doc.uploadedAt)}</TableCell>
                      <TableCell className={FLEET_TABLE_CELL} onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap gap-2 text-[13px]">
                          <button
                            type="button"
                            className={FLEET_LINK_ACTION}
                            onClick={() => void openDocument(doc)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="font-medium text-slate-700 hover:underline"
                            onClick={() => openForm('edit', doc)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="font-medium text-indigo-700 hover:underline"
                            onClick={() => openForm('replace', doc)}
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            className="font-medium text-red-600 hover:underline"
                            onClick={() => handleDelete(doc)}
                          >
                            Delete
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </Card>

      <DocumentDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        document={detailDocument}
        ownerName={ownerName}
        onOpenFile={async (doc) => {
          if (!(await openFileIfAvailable(doc))) {
            setToast({ type: 'error', message: 'Metadata-only document: no file available.' });
          }
        }}
      />

      <AddDocumentDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initialDocument={formDocument}
        ownerOptionsByType={ownerOptionsByType}
        onSubmit={handleSubmitForm}
        isSaving={saving}
      />

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-700' : 'bg-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function DocumentDetailDrawer({
  open,
  onOpenChange,
  document,
  ownerName,
  onOpenFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  ownerName: (ot: string, oi: string) => string;
  onOpenFile: (doc: Document) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('documents.viewDetail')}</DialogTitle>
          <DialogDescription>Owner and document metadata.</DialogDescription>
        </DialogHeader>

        {!document ? (
          <p className="text-sm text-gray-500">No document selected.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <DetailItem
              label="Owner"
              value={`${document.ownerType} - ${ownerName(document.ownerType, document.ownerId)}`}
            />
            <DetailItem label="Document Type" value={document.documentType} />
            <DetailItem label="File Name" value={document.fileName} />
            <DetailItem label="Expiry Date" value={formatDate(document.expiryDate)} />
            <DetailItem label="Status" value={document.status} />
            <DetailItem label="Uploaded At" value={formatDate(document.uploadedAt)} />
            <DetailItem label="Notes" value={document.notes || '-'} />
            {documentHasFile(document) ? (
              <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase text-gray-500">File</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void onOpenFile(document)}>
                    Open in new tab
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-500 md:col-span-2">
                Metadata-only document (no uploaded file).
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddDocumentDrawer({
  open,
  onOpenChange,
  mode,
  initialDocument,
  ownerOptionsByType,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DrawerMode;
  initialDocument: Document | null;
  ownerOptionsByType: (ot: Document['ownerType']) => Array<{ id: string; label: string }>;
  onSubmit: (payload: {
    ownerType: Document['ownerType'];
    ownerId: string;
    documentType: string;
    fileName: string;
    expiryDate?: string;
    notes?: string;
    file?: File | null;
  }) => void | Promise<void>;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [ownerType, setOwnerType] = useState<Document['ownerType']>(
    initialDocument?.ownerType ?? 'driver',
  );
  const [ownerId, setOwnerId] = useState(initialDocument?.ownerId ?? '');
  const [documentType, setDocumentType] = useState(initialDocument?.documentType ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState(initialDocument?.expiryDate?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(initialDocument?.notes ?? '');

  const ownerOptions = ownerOptionsByType(ownerType);
  const typeOptions = DOCUMENT_TYPES_BY_OWNER[ownerType] ?? [];
  const currentFileName = initialDocument?.fileName ?? '';
  const displayFileName = selectedFile?.name ?? currentFileName;

  useEffect(() => {
    if (open) {
      setOwnerType(initialDocument?.ownerType ?? 'driver');
      setOwnerId(initialDocument?.ownerId ?? '');
      setDocumentType(initialDocument?.documentType ?? '');
      setSelectedFile(null);
      setExpiryDate(initialDocument?.expiryDate?.slice(0, 10) ?? '');
      setNotes(initialDocument?.notes ?? '');
    }
  }, [open, initialDocument]);

  function submit() {
    if (!ownerId || !documentType) return;
    if (mode === 'add' && !selectedFile) return;
    if (mode === 'replace' && !selectedFile && !displayFileName) return;

    void onSubmit({
      ownerType,
      ownerId,
      documentType,
      fileName: selectedFile?.name ?? currentFileName,
      expiryDate: expiryDate || undefined,
      notes: notes || undefined,
      file: selectedFile,
    });
  }

  const title =
    mode === 'add' ? t('documents.addDocument') : mode === 'edit' ? t('common.edit') : 'Replace Document';

  const fileRequired = mode === 'add' || mode === 'replace';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('documents.chooseFile')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Owner Type</label>
            <Select
              value={ownerType}
              onChange={(e) => {
                const next = e.target.value as Document['ownerType'];
                setOwnerType(next);
                setOwnerId('');
                setDocumentType('');
              }}
              disabled={mode !== 'add'}
            >
              {OWNER_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Owner</label>
            <Select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              disabled={mode !== 'add'}
            >
              <option value="">Select owner</option>
              {ownerOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Document Type</label>
            <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              <option value="">Select document type</option>
              {typeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">
              {t('documents.fileName')}
              {fileRequired ? ' *' : ''}
            </label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <p className="mt-1.5 text-xs text-emerald-700">
                {t('documents.selectedFile', { name: selectedFile.name })}
              </p>
            ) : currentFileName ? (
              <p className="mt-1.5 text-xs text-slate-500">
                {t('documents.currentFile', { name: currentFileName })}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">{t('documents.chooseFile')}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Expiry Date</label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isSaving || (fileRequired && !selectedFile && !currentFileName)}
          >
            {isSaving ? 'Uploading...' : mode === 'add' ? t('common.add') : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value}</p>
    </div>
  );
}
