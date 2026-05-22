'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  addDocument,
  deleteDocument,
  getDocumentOwnerName,
  getDocuments,
  getMissingRequiredDocuments,
  updateDocument,
} from '@/lib/documents';
import { getCompanies } from '@/lib/companies';
import { mockDrivers, mockVehicles } from '@/lib/mock-data';
import type { Document } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';

const OWNER_TYPES: Array<Document['ownerType']> = ['driver', 'vehicle', 'company', 'request', 'accident', 'cargo_damage'];

const DOCUMENT_TYPES_BY_OWNER: Record<Document['ownerType'], string[]> = {
  driver: ['Driving License', 'Passport', 'Contract', 'Sick Note', 'Salary Document'],
  vehicle: ['TUV', 'SP', 'Registration', 'Insurance', 'Service Report'],
  company: ['Contract', 'Price Agreement', 'Contact Form'],
  request: ['Request Attachment'],
  accident: ['Accident Report'],
  cargo_damage: ['Cargo Damage Report'],
};

type DrawerMode = 'add' | 'edit' | 'replace';

function badgeClass(status: Document['status']) {
  if (status === 'valid') return 'bg-emerald-100 text-emerald-700';
  if (status === 'expiring_soon') return 'bg-amber-100 text-amber-700';
  if (status === 'expired') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function ownerOptionsByType(ownerType: Document['ownerType']) {
  if (ownerType === 'driver') {
    return mockDrivers.map((driver) => ({
      id: driver.id,
      label: `${driver.first_name} ${driver.last_name}`,
    }));
  }

  if (ownerType === 'vehicle') {
    return mockVehicles.map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.plate_number,
    }));
  }

  if (ownerType === 'company') {
    return getCompanies().map((company) => ({
      id: company.id,
      label: company.name,
    }));
  }

  return [];
}

export default function DocumentsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<'all' | Document['ownerType']>('all');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Document['status']>(() => {
    const statusParam = searchParams.get('status');
    if (!statusParam) return 'all';
    if (statusParam === 'valid' || statusParam === 'expiring_soon' || statusParam === 'expired' || statusParam === 'missing') {
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

  const documents = useMemo(() => {
    void reloadKey;
    const base = getDocuments();
    const missing = OWNER_TYPES.flatMap((ownerType) => {
      const options = ownerOptionsByType(ownerType);
      return options.flatMap((owner) => getMissingRequiredDocuments(ownerType, owner.id));
    });
    return [...base, ...missing];
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const statusQuery = searchParams.get('status');
    const statusQueryValues = statusQuery
      ? statusQuery.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

    return documents.filter((doc) => {
      const ownerTypePass = ownerTypeFilter === 'all' || doc.ownerType === ownerTypeFilter;
      const docTypePass = documentTypeFilter === 'all' || doc.documentType === documentTypeFilter;
      const statusPass =
        statusQueryValues.length > 0
          ? statusQueryValues.includes(doc.status)
          : statusFilter === 'all' || doc.status === statusFilter;

      const q = search.trim().toLowerCase();
      const ownerName = getDocumentOwnerName(doc.ownerType, doc.ownerId).toLowerCase();
      const searchPass =
        !q ||
        ownerName.includes(q) ||
        doc.fileName.toLowerCase().includes(q) ||
        doc.documentType.toLowerCase().includes(q);

      return ownerTypePass && docTypePass && statusPass && searchPass;
    });
  }, [documents, ownerTypeFilter, documentTypeFilter, statusFilter, search, searchParams]);

  const availableTypes = useMemo(() => {
    const values = new Set(documents.map((item) => item.documentType));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [documents]);

  function refresh() {
    setReloadKey((prev) => prev + 1);
  }

  function openDetail(document: Document) {
    setDetailDocument(document);
    setDetailOpen(true);
  }

  function openForm(mode: DrawerMode, document?: Document) {
    setFormMode(mode);
    setFormDocument(document ?? null);
    setFormOpen(true);
  }

  function handleDelete(document: Document) {
    if (document.status === 'missing') return;
    deleteDocument(document.id);
    refresh();
  }

  function handleSubmitForm(payload: Omit<Document, 'id' | 'uploadedAt' | 'status'>) {
    if (formMode === 'add') {
      addDocument({
        id: `doc-${Date.now()}`,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        documentType: payload.documentType,
        fileName: payload.fileName,
        fileUrl: '#',
        expiryDate: payload.expiryDate,
        uploadedAt: new Date().toISOString().slice(0, 10),
        status: 'valid',
        notes: payload.notes,
      });
      refresh();
      setFormOpen(false);
      return;
    }

    if (!formDocument) return;

    updateDocument(formDocument.id, {
      ownerType: payload.ownerType,
      ownerId: payload.ownerId,
      documentType: payload.documentType,
      fileName: payload.fileName,
      fileUrl: '#',
      expiryDate: payload.expiryDate,
      notes: payload.notes,
    });
    refresh();
    setFormOpen(false);
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
            <Select value={ownerTypeFilter} onChange={(e) => setOwnerTypeFilter(e.target.value as 'all' | Document['ownerType'])}>
              <option value="all">{t('documents.ownerType')}: All</option>
              {OWNER_TYPES.map((ownerType) => (
                <option key={ownerType} value={ownerType}>{ownerType}</option>
              ))}
            </Select>

            <Select value={documentTypeFilter} onChange={(e) => setDocumentTypeFilter(e.target.value)}>
              <option value="all">{t('documents.documentType')}: All</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>

            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Document['status'])}>
              <option value="all">{t('common.status')}: All</option>
              <option value="valid">valid</option>
              <option value="expiring_soon">expiring_soon</option>
              <option value="expired">expired</option>
              <option value="missing">missing</option>
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
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title="No documents found"
              subtitle="No documents uploaded yet."
              actionLabel="Upload Document"
              onAction={() => openForm('add')}
            />
          </div>
        ) : (
          <>
        <div className="space-y-3 p-3 md:hidden">
          {filtered.map((doc) => (
            <div key={`doc-card-${doc.id}-${doc.status}`} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-900">{doc.documentType}</p>
              <p className="text-xs text-slate-600">{doc.fileName}</p>
              <p className="text-xs text-slate-600">{getDocumentOwnerName(doc.ownerType, doc.ownerId)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => openDetail(doc)}>View</button>
                <button type="button" className="font-medium text-slate-700 hover:underline" onClick={() => openForm('edit', doc)} disabled={doc.status === 'missing'}>Edit</button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
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
            {filtered.map((doc) => (
              <TableRow key={`${doc.id}-${doc.status}`}>
                <TableCell className="capitalize">{doc.ownerType}</TableCell>
                <TableCell>{getDocumentOwnerName(doc.ownerType, doc.ownerId)}</TableCell>
                <TableCell>{doc.documentType}</TableCell>
                <TableCell>{doc.fileName}</TableCell>
                <TableCell>{doc.expiryDate || '-'}</TableCell>
                <TableCell>
                  <Badge className={badgeClass(doc.status)}>{doc.status}</Badge>
                </TableCell>
                <TableCell>{doc.uploadedAt}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => openDetail(doc)}>View</button>
                    <button type="button" className="font-medium text-slate-700 hover:underline" onClick={() => openForm('edit', doc)} disabled={doc.status === 'missing'}>Edit</button>
                    <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => openForm('replace', doc)} disabled={doc.status === 'missing'}>Replace</button>
                    <button type="button" className="font-medium text-red-600 hover:underline" onClick={() => handleDelete(doc)} disabled={doc.status === 'missing'}>Delete</button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
          </>
        )}
      </Card>

      <DocumentDetailDrawer open={detailOpen} onOpenChange={setDetailOpen} document={detailDocument} />

      <AddDocumentDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initialDocument={formDocument}
        onSubmit={handleSubmitForm}
      />
    </div>
  );
}

function DocumentDetailDrawer({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('documents.viewDetail')}</DialogTitle>
          <DialogDescription>Owner and document metadata with file preview placeholder.</DialogDescription>
        </DialogHeader>

        {!document ? (
          <p className="text-sm text-gray-500">No document selected.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <DetailItem label="Owner" value={`${document.ownerType} - ${getDocumentOwnerName(document.ownerType, document.ownerId)}`} />
            <DetailItem label="Document Type" value={document.documentType} />
            <DetailItem label="File Name" value={document.fileName} />
            <DetailItem label="Expiry Date" value={document.expiryDate || '-'} />
            <DetailItem label="Status" value={document.status} />
            <DetailItem label="Uploaded At" value={document.uploadedAt} />
            <DetailItem label="Notes" value={document.notes || '-'} />
            <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-500 md:col-span-2">
              {t('documents.filePreview')}
            </div>
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
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DrawerMode;
  initialDocument: Document | null;
  onSubmit: (payload: Omit<Document, 'id' | 'uploadedAt' | 'status'>) => void;
}) {
  const { t } = useTranslation();
  const [ownerType, setOwnerType] = useState<Document['ownerType']>(initialDocument?.ownerType ?? 'driver');
  const [ownerId, setOwnerId] = useState(initialDocument?.ownerId ?? '');
  const [documentType, setDocumentType] = useState(initialDocument?.documentType ?? '');
  const [fileName, setFileName] = useState(initialDocument?.fileName ?? '');
  const [expiryDate, setExpiryDate] = useState(initialDocument?.expiryDate ?? '');
  const [notes, setNotes] = useState(initialDocument?.notes ?? '');

  const ownerOptions = ownerOptionsByType(ownerType);
  const typeOptions = DOCUMENT_TYPES_BY_OWNER[ownerType] ?? [];

  function resetWithInitial() {
    setOwnerType(initialDocument?.ownerType ?? 'driver');
    setOwnerId(initialDocument?.ownerId ?? '');
    setDocumentType(initialDocument?.documentType ?? '');
    setFileName(initialDocument?.fileName ?? '');
    setExpiryDate(initialDocument?.expiryDate ?? '');
    setNotes(initialDocument?.notes ?? '');
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      resetWithInitial();
    }
  }

  function submit() {
    if (!ownerId || !documentType || !fileName) return;

    onSubmit({
      ownerType,
      ownerId,
      documentType,
      fileName,
      fileUrl: '#',
      expiryDate: expiryDate || undefined,
      notes: notes || undefined,
    });
  }

  const title = mode === 'add' ? t('documents.addDocument') : mode === 'edit' ? t('common.edit') : 'Replace Document';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>No real upload in MVP. File fields are placeholders only.</DialogDescription>
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
            >
              {OWNER_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Owner</label>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Select owner</option>
              {ownerOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Document Type</label>
            <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              <option value="">Select document type</option>
              {typeOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">File Name</label>
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="example.pdf" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Expiry Date</label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{mode === 'add' ? t('common.add') : 'Save'}</Button>
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
