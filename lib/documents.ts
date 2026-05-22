import { mockDrivers, mockVehicles } from './mock-data';
import type { Document } from './types';
import { cargoDamageCompanies } from './cargo-damage';

const DAY_MS = 1000 * 60 * 60 * 24;

const REQUIRED_DOCUMENTS: Record<Document['ownerType'], string[]> = {
  driver: ['Driving License', 'Passport', 'Contract', 'Sick Note', 'Salary Document'],
  vehicle: ['TUV', 'SP', 'Registration', 'Insurance', 'Service Report'],
  company: ['Contract', 'Price Agreement', 'Contact Form'],
  request: [],
  accident: [],
  cargo_damage: [],
};

const documentStore: Document[] = [
  {
    id: 'doc-d-1',
    ownerType: 'driver',
    ownerId: 'drv-101',
    documentType: 'Driving License',
    fileName: 'drv-101-license.pdf',
    fileUrl: '#',
    expiryDate: '2027-12-31',
    uploadedAt: '2026-02-12',
    status: 'valid',
    notes: 'Primary license document.',
  },
  {
    id: 'doc-d-2',
    ownerType: 'driver',
    ownerId: 'drv-101',
    documentType: 'Passport',
    fileName: 'drv-101-passport.pdf',
    fileUrl: '#',
    expiryDate: '2026-07-20',
    uploadedAt: '2026-03-05',
    status: 'expiring_soon',
  },
  {
    id: 'doc-d-3',
    ownerType: 'driver',
    ownerId: 'drv-102',
    documentType: 'Contract',
    fileName: 'drv-102-contract.pdf',
    fileUrl: '#',
    expiryDate: '2026-06-01',
    uploadedAt: '2025-11-15',
    status: 'expiring_soon',
  },
  {
    id: 'doc-v-1',
    ownerType: 'vehicle',
    ownerId: 'veh-001',
    documentType: 'TUV',
    fileName: 'veh-001-tuv.pdf',
    fileUrl: '#',
    expiryDate: '2026-05-29',
    uploadedAt: '2025-10-01',
    status: 'expiring_soon',
  },
  {
    id: 'doc-v-2',
    ownerType: 'vehicle',
    ownerId: 'veh-001',
    documentType: 'Insurance',
    fileName: 'veh-001-insurance.pdf',
    fileUrl: '#',
    expiryDate: '2027-11-30',
    uploadedAt: '2026-01-08',
    status: 'valid',
  },
  {
    id: 'doc-v-3',
    ownerType: 'vehicle',
    ownerId: 'veh-002',
    documentType: 'SP',
    fileName: 'veh-002-sp.pdf',
    fileUrl: '#',
    expiryDate: '2026-04-10',
    uploadedAt: '2025-09-12',
    status: 'expired',
  },
  {
    id: 'doc-c-1',
    ownerType: 'company',
    ownerId: 'cmp-dhl',
    documentType: 'Contract',
    fileName: 'dhl-master-contract.pdf',
    fileUrl: '#',
    expiryDate: '2027-02-28',
    uploadedAt: '2026-01-05',
    status: 'valid',
  },
  {
    id: 'doc-c-2',
    ownerType: 'company',
    ownerId: 'cmp-dhl',
    documentType: 'Price Agreement',
    fileName: 'dhl-price-agreement.pdf',
    fileUrl: '#',
    expiryDate: '2026-08-15',
    uploadedAt: '2026-02-17',
    status: 'expiring_soon',
  },
  {
    id: 'doc-c-3',
    ownerType: 'company',
    ownerId: 'cmp-amazon',
    documentType: 'Contact Form',
    fileName: 'amazon-contact-form.pdf',
    fileUrl: '#',
    uploadedAt: '2026-04-03',
    status: 'valid',
  },
];

function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDocumentStatus(expiryDate?: string): Document['status'] {
  if (!expiryDate) return 'valid';
  const today = new Date(`${todayDate()}T00:00:00`);
  const exp = new Date(`${expiryDate}T00:00:00`);
  const diff = Math.floor((exp.getTime() - today.getTime()) / DAY_MS);
  if (diff < 0) return 'expired';
  if (diff <= 90) return 'expiring_soon';
  return 'valid';
}

export function getDocuments(): Document[] {
  return [...documentStore].map((item) => ({
    ...item,
    status: item.status === 'missing' ? 'missing' : getDocumentStatus(item.expiryDate),
  }));
}

export function getDocumentsByOwner(ownerType: Document['ownerType'], ownerId: string): Document[] {
  return getDocuments().filter((item) => item.ownerType === ownerType && item.ownerId === ownerId);
}

export function getExpiringDocuments(days = 90): Document[] {
  const today = new Date(`${todayDate()}T00:00:00`);
  return getDocuments().filter((item) => {
    if (!item.expiryDate) return false;
    const exp = new Date(`${item.expiryDate}T00:00:00`);
    const diff = Math.floor((exp.getTime() - today.getTime()) / DAY_MS);
    return diff >= 0 && diff <= days;
  });
}

export function getMissingRequiredDocuments(ownerType: Document['ownerType'], ownerId: string): Document[] {
  const required = REQUIRED_DOCUMENTS[ownerType] ?? [];
  const existing = getDocumentsByOwner(ownerType, ownerId).map((item) => item.documentType);

  return required
    .filter((docType) => !existing.includes(docType))
    .map((docType) => ({
      id: `missing-${ownerType}-${ownerId}-${docType}`,
      ownerType,
      ownerId,
      documentType: docType,
      fileName: '-',
      fileUrl: undefined,
      expiryDate: undefined,
      uploadedAt: '-',
      status: 'missing' as const,
      notes: undefined,
    }));
}

export function addDocument(document: Document) {
  documentStore.push({
    ...document,
    status: document.status === 'missing' ? 'missing' : getDocumentStatus(document.expiryDate),
  });
  return document;
}

export function updateDocument(documentId: string, data: Partial<Document>) {
  const target = documentStore.find((item) => item.id === documentId);
  if (!target) return null;
  Object.assign(target, data);
  target.status = target.status === 'missing' ? 'missing' : getDocumentStatus(target.expiryDate);
  return target;
}

export function deleteDocument(documentId: string) {
  const index = documentStore.findIndex((item) => item.id === documentId);
  if (index === -1) return false;
  documentStore.splice(index, 1);
  return true;
}

export function getDocumentOwnerName(ownerType: Document['ownerType'], ownerId: string) {
  if (ownerType === 'driver') {
    const driver = mockDrivers.find((item) => item.id === ownerId);
    return driver ? `${driver.first_name} ${driver.last_name}` : ownerId;
  }

  if (ownerType === 'vehicle') {
    const vehicle = mockVehicles.find((item) => item.id === ownerId);
    return vehicle?.plate_number ?? ownerId;
  }

  if (ownerType === 'company') {
    const company = cargoDamageCompanies.find((item) => item.id === ownerId);
    return company?.name ?? ownerId;
  }

  return ownerId;
}
