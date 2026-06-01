import apiClient from '../lib/api';

export type DocumentOwnerType =
  | 'driver'
  | 'vehicle'
  | 'company'
  | 'request'
  | 'accident'
  | 'cargo_damage'
  | 'vehicle_handover'
  | 'assignment'
  | 'service_record';

export interface ListDocumentsParams {
  ownerType?: DocumentOwnerType;
  ownerId?: string;
  status?: string;
  documentType?: string;
  search?: string;
}

export interface CreateDocumentPayload {
  ownerType: DocumentOwnerType;
  ownerId: string;
  documentType: string;
  fileName: string;
  fileUrl?: string;
  expiryDate?: string;
  notes?: string;
}

export interface UpdateDocumentPayload {
  documentType?: string;
  fileName?: string;
  fileUrl?: string;
  expiryDate?: string;
  status?: string;
  notes?: string;
}

export const documentsService = {
  listDocuments(params?: ListDocumentsParams) {
    return apiClient.get('/documents', { params });
  },

  getExpiringDocuments(days = 90) {
    return apiClient.get('/documents/expiring', { params: { days } });
  },

  getDocumentsByOwner(ownerType: DocumentOwnerType, ownerId: string) {
    return apiClient.get(`/documents/owner/${ownerType}/${ownerId}`);
  },

  getDocumentById(id: string) {
    return apiClient.get(`/documents/${id}`);
  },

  createDocument(payload: CreateDocumentPayload, uploadedById?: string) {
    return apiClient.post('/documents', payload, {
      params: uploadedById ? { uploadedById } : undefined,
    });
  },

  updateDocument(id: string, payload: UpdateDocumentPayload) {
    return apiClient.patch(`/documents/${id}`, payload);
  },

  replaceDocument(id: string, payload: UpdateDocumentPayload, uploadedById?: string) {
    return apiClient.post(`/documents/${id}/replace`, payload, {
      params: uploadedById ? { uploadedById } : undefined,
    });
  },

  deleteDocument(id: string) {
    return apiClient.delete(`/documents/${id}`);
  },
};

export default documentsService;
