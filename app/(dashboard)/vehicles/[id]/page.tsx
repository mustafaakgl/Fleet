'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Pencil, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vehiclesApi } from '@/lib/api';
import type { VehicleDetail } from '@/lib/types';
import { mockVehicleDetails } from '@/lib/mock-data';
import { getCargoDamageReportsByVehicle } from '@/lib/cargo-damage';
import { getVehicleHandoversByVehicle } from '@/lib/vehicle-handovers';
import { getDocumentsByOwner, getMissingRequiredDocuments } from '@/lib/documents';
import { useTranslation } from 'react-i18next';
import { expiryBadgeColor, formatDate, statusColor } from '@/lib/utils';

interface VehicleExtraProfile {
  vehicleCode: string;
  vin: string;
  mileage: number;
  notes: string;
}

const VEHICLE_EXTRA_PROFILE: Record<string, VehicleExtraProfile> = {
  'veh-001': {
    vehicleCode: 'AP-101',
    vin: 'WDB00000123456789',
    mileage: 142300,
    notes: 'Preferred for city routes, recent brake check completed.',
  },
  'veh-002': {
    vehicleCode: 'AP-102',
    vin: 'WDB00000987654321',
    mileage: 119900,
    notes: 'Requires tire pressure verification every Monday.',
  },
};

function currency(value?: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}


function sectionStatusClass(value: string) {
  if (value === 'Open' || value === 'Pending') return 'bg-amber-100 text-amber-700';
  if (value === 'Closed' || value === 'Done') return 'bg-emerald-100 text-emerald-700';
  if (value === 'Damaged') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    vehiclesApi
      .getById(id)
      .then((res) => setVehicle(res))
      .catch(() => {
        const mock = mockVehicleDetails[id];
        if (mock) {
          setVehicle(mock);
          return;
        }
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const extra = useMemo(() => {
    if (!vehicle) return null;
    return (
      VEHICLE_EXTRA_PROFILE[vehicle.id] ?? {
        vehicleCode: `VC-${vehicle.id.toUpperCase()}`,
        vin: 'VIN-NOT-SET',
        mileage: 100000,
        notes: 'No additional notes yet.',
      }
    );
  }, [vehicle]);

  const currentAssignment = vehicle?.recent_assignments?.[0] ?? null;
  const currentDriver = currentAssignment?.driver.name ?? (vehicle?.current_driver ? `${vehicle.current_driver.first_name} ${vehicle.current_driver.last_name}` : '-');
  const currentCompany = currentAssignment?.company_name ?? '-';
  const cargoDamageHistory = getCargoDamageReportsByVehicle(vehicle?.id ?? '');
  const vehicleHandoverHistory = getVehicleHandoversByVehicle(extra?.vehicleCode ?? '');
  const vehicleDocuments = useMemo(() => {
    if (!vehicle) return [];
    return [
      ...getDocumentsByOwner('vehicle', vehicle.id),
      ...getMissingRequiredDocuments('vehicle', vehicle.id),
    ];
  }, [vehicle]);

  const driverHistory = useMemo(() => {
    if (!vehicle?.recent_assignments?.length) {
      return [{ id: 'no-driver-history', driver: '-', fromDate: '-', toDate: '-', totalDays: 0 }];
    }

    return vehicle.recent_assignments.map((item, index) => ({
      id: `${item.id}-dh`,
      driver: item.driver.name,
      fromDate: item.work_date,
      toDate: item.work_date,
      totalDays: 1 + index,
    }));
  }, [vehicle]);

  const serviceHistory = useMemo(() => {
    return [
      {
        id: 'svc-1',
        date: '2026-04-16',
        serviceType: 'Periodic Maintenance',
        repairCompany: 'Berlin Truck Service GmbH',
        mileage: (extra?.mileage ?? 100000) - 5400,
        cost: 1350,
        status: 'Done',
      },
      {
        id: 'svc-2',
        date: '2026-05-05',
        serviceType: 'Brake Inspection',
        repairCompany: 'Nord Werkstatt AG',
        mileage: (extra?.mileage ?? 100000) - 1200,
        cost: 640,
        status: 'Pending',
      },
    ];
  }, [extra?.mileage]);

  const handoverHistory = useMemo(() => {
    return [
      {
        id: 'ho-1',
        date: '2026-05-18',
        driver: currentDriver,
        type: 'pickup',
        photoStatus: 'Uploaded',
        damageNotes: 'No visible damage',
      },
      {
        id: 'ho-2',
        date: '2026-05-19',
        driver: currentDriver,
        type: 'return',
        photoStatus: 'Pending',
        damageNotes: 'Minor scratch on rear door',
      },
    ];
  }, [currentDriver]);

  const accidentHistory = useMemo(() => {
    return [
      {
        id: 'acc-1',
        date: '2026-03-02',
        driver: currentDriver,
        type: 'Mirror Damage',
        damageCost: 480,
        status: 'Closed',
      },
      {
        id: 'acc-2',
        date: '2026-04-21',
        driver: currentDriver,
        type: 'Rear bumper contact',
        damageCost: 950,
        status: 'Open',
      },
    ];
  }, [currentDriver]);

  const equipment = useMemo(() => {
    return [
      { id: 'eq-1', name: 'Fire Extinguisher', quantity: 2, condition: 'Good', lastChecked: '2026-05-01' },
      { id: 'eq-2', name: 'First Aid Kit', quantity: 1, condition: 'Good', lastChecked: '2026-05-10' },
      { id: 'eq-3', name: 'Tie-down Straps', quantity: 12, condition: 'Needs replacement', lastChecked: '2026-04-25' },
    ];
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !vehicle || !extra) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg text-gray-500">Vehicle not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/vehicles">{t('common.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/vehicles">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Link>
      </Button>

      <Card className="sticky top-3 z-20 border-purple-200 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
                <Truck className="h-7 w-7 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{vehicle.plate_number}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span>{extra.vehicleCode}</span>
                  <span className="text-gray-400">|</span>
                  <Badge className={statusColor(vehicle.status)}>{vehicle.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm md:grid-cols-4">
              <HeaderItem label="Current driver" value={currentDriver} />
              <HeaderItem label="Current company" value={currentCompany} />
              <HeaderItem label="TÜV expiry" value={formatDate(vehicle.tuv_expiry_date)} />
              <HeaderItem label="SP expiry" value={formatDate(vehicle.sp_expiry_date)} />
              <HeaderItem label="Mileage" value={`${extra.mileage.toLocaleString('de-DE')} km`} />
            </div>

            <Button variant="outline" size="sm" asChild>
              <Link href={`/vehicles/${vehicle.id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label="Plate number" value={vehicle.plate_number} />
            <InfoItem label="Vehicle code" value={extra.vehicleCode} />
            <InfoItem label="VIN" value={extra.vin} />
            <InfoItem label="Brand" value={vehicle.brand} />
            <InfoItem label="Model" value={vehicle.model} />
            <InfoItem label="Year" value={String(vehicle.year ?? '-')} />
            <InfoItem label="Mileage" value={`${extra.mileage.toLocaleString('de-DE')} km`} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Assignment</CardTitle>
        </CardHeader>
        <CardContent>
          {currentAssignment ? (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Date" value={formatDate(currentAssignment.work_date)} />
              <InfoItem label="Driver" value={currentAssignment.driver.name} />
              <InfoItem label="Company" value={currentAssignment.company_name} />
              <InfoItem label="Route" value={currentAssignment.notes || 'Standard route'} />
              <InfoItem label="Start time" value={currentAssignment.start_time} />
              <InfoItem label="End time" value={currentAssignment.end_time} />
              <InfoItem label="Status" value={currentAssignment.status} />
              <InfoItem label="Expected revenue" value={currency(1100)} />
            </dl>
          ) : (
            <p className="text-sm text-gray-500">No active assignment.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document type</TableHead>
                <TableHead>File name</TableHead>
                <TableHead>Expiry date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>{doc.documentType}</TableCell>
                  <TableCell>{doc.fileName}</TableCell>
                  <TableCell>{formatDate(doc.expiryDate)}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        doc.status === 'valid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : doc.status === 'expiring_soon'
                            ? 'bg-amber-100 text-amber-700'
                            : doc.status === 'expired'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-700'
                      }
                    >
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button type="button" className="text-sm font-medium text-blue-600 hover:underline">View</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicle.recent_assignments.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDate(item.work_date)}</TableCell>
                  <TableCell>{item.driver.name}</TableCell>
                  <TableCell>{item.company_name}</TableCell>
                  <TableCell>{item.notes || 'Daily route'}</TableCell>
                  <TableCell>{currency(1050)}</TableCell>
                  <TableCell>
                    <Badge className={statusColor(item.status)}>{item.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>From date</TableHead>
                <TableHead>To date</TableHead>
                <TableHead>Total days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.driver}</TableCell>
                  <TableCell>{formatDate(item.fromDate)}</TableCell>
                  <TableCell>{formatDate(item.toDate)}</TableCell>
                  <TableCell>{item.totalDays}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service type</TableHead>
                <TableHead>Repair company</TableHead>
                <TableHead>Mileage</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>{item.serviceType}</TableCell>
                  <TableCell>{item.repairCompany}</TableCell>
                  <TableCell>{item.mileage.toLocaleString('de-DE')} km</TableCell>
                  <TableCell>{currency(item.cost)}</TableCell>
                  <TableCell>
                    <Badge className={sectionStatusClass(item.status)}>{item.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Handover History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Photo status</TableHead>
                <TableHead>Damage notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {handoverHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>{item.driver}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.photoStatus}</TableCell>
                  <TableCell>{item.damageNotes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Handover History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Previous Vehicle</TableHead>
                <TableHead>Photo Required</TableHead>
                <TableHead>Photo Status</TableHead>
                <TableHead>Damage Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleHandoverHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500">No handover records.</TableCell>
                </TableRow>
              ) : (
                vehicleHandoverHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.date)}</TableCell>
                    <TableCell>{item.driverId}</TableCell>
                    <TableCell>{item.previousVehicleId || '-'}</TableCell>
                    <TableCell>{item.photoRequired ? 'Required' : 'Not Required'}</TableCell>
                    <TableCell>{item.photoStatus.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{item.damageNotes || 'No damage'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accident / Damage History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Damage cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accidentHistory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>{item.driver}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{currency(item.damageCost)}</TableCell>
                  <TableCell>
                    <Badge className={sectionStatusClass(item.status)}>{item.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cargo Damage History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Damage value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargoDamageHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500">No cargo damage reports.</TableCell>
                </TableRow>
              ) : (
                cargoDamageHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.date)}</TableCell>
                    <TableCell>{item.cargoName}</TableCell>
                    <TableCell>{item.cargoOwner}</TableCell>
                    <TableCell>{item.companyName}</TableCell>
                    <TableCell>{item.damageValue != null ? currency(item.damageValue) : '-'}</TableCell>
                    <TableCell>{item.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipment</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment name</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Last checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.condition}</TableCell>
                  <TableCell>{formatDate(item.lastChecked)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            defaultValue={extra.notes}
            rows={5}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function HeaderItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}
