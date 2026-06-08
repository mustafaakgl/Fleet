'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Package,
  Truck,
} from 'lucide-react';
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
import type { CustomerAssignment, CustomerDashboardStats } from '@/lib/types';

function assignmentStatusColor(status: string): string {
  if (status === 'confirmed') return 'bg-indigo-100 text-indigo-700';
  return statusColor(status);
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
          )}
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomerPortalDashboardPage() {
  const [stats, setStats] = useState<CustomerDashboardStats | null>(null);
  const [assignments, setAssignments] = useState<CustomerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [dashboardStats, assignmentPage] = await Promise.all([
          customerPortalApi.getDashboard(),
          customerPortalApi.getAssignments({ limit: 10, page: 1 }),
        ]);

        if (!mounted) return;
        setStats(dashboardStats);
        setAssignments(assignmentPage.data);
      } catch {
        if (!mounted) return;
        setError('Dashboard could not be loaded. Please sign in again or try later.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <CustomerPortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Overview of your active and upcoming transports.
          </p>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Active transports"
            value={stats?.activeTransports ?? 0}
            icon={Truck}
            loading={loading}
          />
          <StatCard
            label="In progress"
            value={stats?.inProgress ?? 0}
            icon={Package}
            loading={loading}
          />
          <StatCard
            label="Completed today"
            value={stats?.completedToday ?? 0}
            icon={CheckCircle2}
            loading={loading}
          />
          <StatCard
            label="Upcoming"
            value={stats?.upcoming ?? 0}
            icon={CalendarClock}
            loading={loading}
          />
          <StatCard
            label="Pending proofs"
            value={stats?.pendingProofs ?? 0}
            icon={ClipboardList}
            loading={loading}
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Recent assignments</CardTitle>
            <Link href="/portal/assignments" className="text-sm font-medium text-blue-700 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-gray-500">No assignments found for your companies.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
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
                        <TableCell>{assignment.driverDisplayName}</TableCell>
                        <TableCell>{assignment.vehiclePlateNumber}</TableCell>
                        <TableCell>
                          <Badge className={assignmentStatusColor(assignment.status)}>
                            {formatStatusLabel(assignment.status)}
                          </Badge>
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
