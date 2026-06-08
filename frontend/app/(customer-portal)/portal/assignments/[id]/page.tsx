'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, MessageSquare, Send, Upload } from 'lucide-react';
import { CustomerPortalShell } from '@/components/customer-portal/CustomerPortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { customerPortalApi } from '@/lib/api';
import { documentHasFile, openAuthenticatedFile } from '@/lib/file-access';
import { formatDate, statusColor } from '@/lib/utils';
import type { CustomerAssignment, CustomerAssignmentMessage, Document } from '@/lib/types';

function assignmentStatusColor(status: string): string {
  if (status === 'confirmed') return 'bg-indigo-100 text-indigo-700';
  return statusColor(status);
}

export default function CustomerAssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignment, setAssignment] = useState<CustomerAssignment | null>(null);
  const [proofs, setProofs] = useState<Document[]>([]);
  const [messages, setMessages] = useState<CustomerAssignmentMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignmentData, proofRows, messageRows] = await Promise.all([
        customerPortalApi.getAssignment(assignmentId),
        customerPortalApi.listProofs(assignmentId),
        customerPortalApi.listMessages(assignmentId),
      ]);
      setAssignment(assignmentData);
      setProofs(proofRows);
      setMessages(messageRows);
    } catch {
      setError('Assignment could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canUpload =
    assignment &&
    ['confirmed', 'in_progress', 'completed'].includes(assignment.status);

  async function handleUpload(file: File) {
    if (!assignment) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await customerPortalApi.uploadProof(assignment.id, formData);
      await load();
    } catch {
      setError('Upload failed. Use PDF, JPG, PNG or WEBP (max 10 MB).');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSendMessage() {
    if (!assignment || !messageDraft.trim()) return;
    setSendingMessage(true);
    setError(null);
    try {
      const sent = await customerPortalApi.sendMessage(assignment.id, messageDraft.trim());
      setMessages((current) => [...current, sent]);
      setMessageDraft('');
    } catch {
      setError('Message could not be sent.');
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleOpenProof(doc: Document) {
    if (!documentHasFile(doc) || !doc.download_url) return;
    setOpeningDocId(doc.id);
    try {
      await openAuthenticatedFile(doc.download_url, doc.fileName);
    } catch {
      setError('Could not open file.');
    } finally {
      setOpeningDocId(null);
    }
  }

  return (
    <CustomerPortalShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/portal/assignments"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to assignments
          </Link>
        </div>

        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !assignment ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-700">{error ?? 'Not found.'}</CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {assignment.routeName ?? assignment.cargoName}
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  {formatDate(assignment.workDate)} · {assignment.startTime} – {assignment.endTime}
                </p>
              </div>
              <Badge className={assignmentStatusColor(assignment.status)}>
                {assignment.status.replace(/_/g, ' ')}
              </Badge>
            </div>

            {error ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Transport details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-700">
                  <DetailRow label="Company" value={assignment.companyName} />
                  <DetailRow label="Cargo" value={assignment.cargoName} />
                  <DetailRow label="Pickup" value={assignment.pickupAddress} />
                  <DetailRow label="Delivery" value={assignment.deliveryAddress} />
                  <DetailRow label="Driver" value={assignment.driverDisplayName} />
                  <DetailRow label="Vehicle" value={assignment.vehiclePlateNumber} />
                  {assignment.notes ? <DetailRow label="Notes" value={assignment.notes} /> : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Delivery proofs
                    {assignment.proofPending ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Proof required
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {canUpload ? (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleUpload(file);
                        }}
                      />
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Upload proof
                      </Button>
                      <p className="mt-2 text-xs text-gray-500">
                        PDF or image, max 10 MB. Upload delivery confirmation, CMR or photo.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Proofs can be uploaded once the transport is confirmed.
                    </p>
                  )}

                  {proofs.length === 0 ? (
                    <p className="text-sm text-gray-500">No proofs uploaded yet.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                      {proofs.map((proof) => (
                        <li key={proof.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{proof.fileName}</p>
                            <p className="text-xs text-gray-500">
                              {proof.uploadedAt
                                ? new Date(proof.uploadedAt).toLocaleString('de-DE')
                                : '—'}
                            </p>
                          </div>
                          {documentHasFile(proof) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={openingDocId === proof.id}
                              onClick={() => void handleOpenProof(proof)}
                            >
                              {openingDocId === proof.id ? 'Opening…' : 'Open'}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No messages yet. Ask a question about this transport.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
                    {messages.map((message) => (
                      <li
                        key={message.id}
                        className={`rounded-md px-3 py-2 text-sm ${
                          message.isFromCustomer
                            ? 'ml-8 bg-blue-100 text-blue-950'
                            : 'mr-8 bg-white text-gray-900 shadow-sm'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                          <span className="font-medium">{message.senderName}</span>
                          <span>{new Date(message.createdAt).toLocaleString('de-DE')}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{message.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <textarea
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    rows={3}
                    placeholder="Write a message to the fleet team…"
                    className="min-h-[80px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    className="self-end"
                    disabled={sendingMessage || !messageDraft.trim()}
                    onClick={() => void handleSendMessage()}
                  >
                    {sendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </CustomerPortalShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-gray-900">{value}</p>
    </div>
  );
}
