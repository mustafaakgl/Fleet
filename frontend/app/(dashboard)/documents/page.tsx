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
import { documentsApi, driversApi, vehiclesApi, companiesApi, type MissingDocumentRow } from '@/lib/api';
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
import { formatDate } from '@/lib/utils';

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

function resolveDocumentUrl(fileUrl?: string) {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return fileUrl;
  }

  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
  try {
    const origin = new URL(base).origin;
    return `${origin}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
  } catch {
    return fileUrl;
  }
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

  function openFileIfAvailable(doc: Document) {
    const url = resolveDocumentUrl(doc.fileUrl);
    if (!url) return false;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
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
        await documentsApi.update(formDocument.id, {
          documentType: payload.documentType,
          fileName: payload.fileName,
          expiryDate: payload.expiryDate,
          notes: payload.notes,
        });
        setToast({ type: 'success', message: 'Document updated.' });
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
          <h1 className="text-2xl font-bold text-gray-900">{t('documents.title')}</h1>
        </div>

        <Button onClick={() => openForm('add')}>
          <Plus className="mr-1 h-4 w-4" />
          {t('documents.addDocument')}
        </Button>
      </div>

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

      <Card>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('documents.ownerType')}</TableHead>
                  <TableHead>{t('documents.ownerName')}</TableHead>
                  <TableHead>{t('documents.documentType')}</TableHead>
                  <TableHead>{t('documents.fileName')}</TableHead>
                  <TableHead>{t('documents.expiryDate')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('documents.uploadedAt')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => {
                  if (entry.kind === 'missing') {
                    return (
                      <TableRow key={`missing-${entry.row.owner_type}-${entry.row.owner_id}-${entry.row.document_type}`}>
                        <TableCell className="capitalize">{entry.row.owner_type}</TableCell>
                        <TableCell>{entry.row.owner_name}</TableCell>
                        <TableCell>{entry.row.document_type}</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>
                          <Badge className={badgeClass('missing')}>missing</Badge>
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-xs font-medium text-blue-600 hover:underline"
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
                    <TableRow key={doc.id}>
                      <TableCell className="capitalize">{doc.ownerType}</TableCell>
                      <TableCell>{ownerName(doc.ownerType, doc.ownerId)}</TableCell>
                      <TableCell>{doc.documentType}</TableCell>
                      <TableCell>{doc.fileName}</TableCell>
                      <TableCell>{formatDate(doc.expiryDate)}</TableCell>
                      <TableCell>
                        <Badge className={badgeClass(doc.status)}>{doc.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            className="font-medium text-blue-600 hover:underline"
                            onClick={() => {
                              if (!openFileIfAvailable(doc)) {
                                openDetail(doc);
                              }
                            }}
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
        )}
      </Card>

      <DocumentDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        document={detailDocument}
        ownerName={ownerName}
        onOpenFile={(doc) => {
          const url = resolveDocumentUrl(doc.fileUrl);
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
          }
          setToast({ type: 'error', message: 'Metadata-only document: no file available.' });
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
            {document.fileUrl ? (
              <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase text-gray-500">File</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onOpenFile(document)}>
                    Open in new tab
                  </Button>
                  <a
                    href={resolveDocumentUrl(document.fileUrl) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Download
                  </a>
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
  const [fileName, setFileName] = useState(initialDocument?.fileName ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState(initialDocument?.expiryDate?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(initialDocument?.notes ?? '');

  const ownerOptions = ownerOptionsByType(ownerType);
  const typeOptions = DOCUMENT_TYPES_BY_OWNER[ownerType] ?? [];

  useEffect(() => {
    if (open) {
      setOwnerType(initialDocument?.ownerType ?? 'driver');
      setOwnerId(initialDocument?.ownerId ?? '');
      setDocumentType(initialDocument?.documentType ?? '');
      setFileName(initialDocument?.fileName ?? '');
      setSelectedFile(null);
      setExpiryDate(initialDocument?.expiryDate?.slice(0, 10) ?? '');
      setNotes(initialDocument?.notes ?? '');
    }
  }, [open, initialDocument]);

  function submit() {
    const effectiveFileName = selectedFile?.name ?? fileName;
    if (!ownerId || !documentType || !effectiveFileName) return;
    void onSubmit({
      ownerType,
      ownerId,
      documentType,
      fileName: effectiveFileName,
      expiryDate: expiryDate || undefined,
      notes: notes || undefined,
      file: selectedFile,
    });
  }

  const title =
    mode === 'add' ? t('documents.addDocument') : mode === 'edit' ? t('common.edit') : 'Replace Document';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Metadata-only flow is still supported. Choose a file to upload.
          </DialogDescription>
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
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">File Name</label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="example.pdf"
              disabled={Boolean(selectedFile)}
            />
          </div>

          {(mode === 'add' || mode === 'replace') && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">File Upload</label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  if (file) {
                    setFileName(file.name);
                  }
                }}
              />
            </div>
          )}

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
          <Button onClick={submit} disabled={isSaving}>
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
