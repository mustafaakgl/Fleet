'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, Upload } from 'lucide-react';
import { CustomerPortalShell } from '@/components/customer-portal/CustomerPortalShell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { customerPortalApi } from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import type { CustomerAssignment } from '@/lib/types';

function assignmentStatusColor(status: string): string {
  if (status === 'confirmed') return 'bg-indigo-100 text-indigo-700';
  return statusColor(status);
}

export default function CustomerAssignmentsPage() {
  const [assignments, setAssignments] = useState<CustomerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const page = await customerPortalApi.getAssignments({ limit: 50, page: 1 });
        if (!mounted) return;
        setAssignments(page.data);
      } catch {
        if (!mounted) return;
        setError('Assignments could not be loaded.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <CustomerPortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Assignments</h1>
          <p className="mt-1 text-sm text-gray-600">
            View transports and upload delivery proofs for completed jobs.
          </p>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>All assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-gray-500">No assignments found.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Proof</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="font-medium">{formatDate(assignment.workDate)}</div>
                          <div className="text-xs text-gray-500">
                            {assignment.startTime} - {assignment.endTime}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{assignment.routeName ?? '-'}</div>
                          <div className="max-w-[220px] truncate text-xs text-gray-500">
                            {assignment.pickupAddress} → {assignment.deliveryAddress}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{assignment.cargoName}</div>
                          <div className="text-xs text-gray-500">{assignment.companyName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={assignmentStatusColor(assignment.status)}>
                            {assignment.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {assignment.proofPending ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Pending
                            </span>
                          ) : assignment.proofCount ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <Upload className="h-3.5 w-3.5" />
                              {assignment.proofCount} file(s)
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/portal/assignments/${assignment.id}`}
                            className="text-sm font-medium text-blue-700 hover:underline"
                          >
                            Details
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerPortalShell>
  );
}
