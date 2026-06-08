'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { serviceRecordsApi } from '@/lib/api';
import type { ServiceRecord, Vehicle } from '@/lib/types';

interface CreateExpenseEntryDialogProps {
  open: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
  onCreated: (record: ServiceRecord) => void;
}

export function CreateExpenseEntryDialog({
  open,
  vehicles,
  onClose,
  onCreated,
}: CreateExpenseEntryDialogProps) {
  const { t } = useTranslation();
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [vendor, setVendor] = useState('');
  const [repairCompany, setRepairCompany] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setVehicleId(vehicles[0]?.id ?? '');
    setDate(iso);
    setServiceType('');
    setVendor('');
    setRepairCompany('');
    setAmount('');
    setNotes('');
    setError(null);
  }, [open, vehicles]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!vehicleId || !date || !serviceType.trim()) {
      setError(t('expenseHistory.create.missingFields'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await serviceRecordsApi.create({
        vehicle_id: vehicleId,
        date,
        service_type: serviceType.trim(),
        vendor: vendor.trim() || undefined,
        repair_company: repairCompany.trim() || undefined,
        cost_amount: Number(amount) || 0,
        notes: notes.trim() || undefined,
      });
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('expenseHistory.create.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('expenseHistory.create.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-vehicle">{t('expenseHistory.colVehicle')}</Label>
            <Select
              id="expense-vehicle"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              className="w-full"
            >
              <option value="">{t('expenseHistory.create.selectVehicle')}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number} · {vehicle.brand} {vehicle.model}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-date">{t('expenseHistory.colDate')}</Label>
              <Input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">{t('expenseHistory.colAmount')}</Label>
              <Input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-type">{t('expenseHistory.colType')}</Label>
            <Input
              id="expense-type"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              placeholder={t('expenseHistory.create.typePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-vendor">{t('expenseHistory.colVendor')}</Label>
            <Input
              id="expense-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder={t('expenseHistory.create.vendorPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-repair-company">{t('expenseHistory.colRepairCompany')}</Label>
            <Input
              id="expense-repair-company"
              value={repairCompany}
              onChange={(e) => setRepairCompany(e.target.value)}
              placeholder={t('expenseHistory.create.repairCompanyPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-notes">{t('serviceHistory.colNotes')}</Label>
            <textarea
              id="expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('expenseHistory.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
