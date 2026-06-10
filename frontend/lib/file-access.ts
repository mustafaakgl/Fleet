import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

function getAccessToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
}

function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

export async function fetchAuthenticatedBlob(apiPath: string): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(resolveApiUrl(apiPath), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`File request failed (${response.status})`);
  }

  return response.blob();
}

export async function openAuthenticatedDocument(
  documentId: string,
  fileName?: string,
): Promise<void> {
  const blob = await fetchAuthenticatedBlob(`/documents/${documentId}/download`);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function vehiclePhotoApiPath(vehicleId: string): string {
  return `/vehicles/${vehicleId}/photo`;
}

export function documentDownloadApiPath(documentId: string): string {
  return `/documents/${documentId}/download`;
}

export function fineDocumentApiPath(fineId: string): string {
  return `/fines/${fineId}/document`;
}

export function defectPhotoApiPath(defectId: string, photoIndex: number): string {
  return `/defects/${defectId}/photo/${photoIndex}`;
}

export function customerProofDownloadApiPath(assignmentId: string, documentId: string): string {
  return `/customer/assignments/${assignmentId}/proofs/${documentId}/download`;
}

export async function openAuthenticatedFile(apiPath: string, fileName?: string): Promise<void> {
  const blob = await fetchAuthenticatedBlob(apiPath);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function documentHasFile(doc: { download_url?: string | null; fileUrl?: string | null }): boolean {
  return Boolean(doc.download_url || doc.fileUrl);
}

export function useAuthenticatedImageUrl(apiPath?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!apiPath) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    fetchAuthenticatedBlob(apiPath)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiPath]);

  return url;
}
