'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BRAND_BTN_PRIMARY, BRAND_FOCUS } from '@/lib/brand-colors';
import { FLEET_FILTER_INPUT, FLEET_FILTER_SELECT } from '@/lib/fleet-table';
import { cn } from '@/lib/utils';
import type { Driver } from '@/lib/types';

interface NewConversationDialogProps {
  open: boolean;
  drivers: Driver[];
  driversLoading: boolean;
  driverId: string;
  subject: string;
  department: string;
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  onDriverChange: (driverId: string) => void;
  onSubjectChange: (subject: string) => void;
  onDepartmentChange: (department: string) => void;
  onCreate: () => void;
}

export function NewConversationDialog({
  open,
  drivers,
  driversLoading,
  driverId,
  subject,
  department,
  creating,
  onOpenChange,
  onDriverChange,
  onSubjectChange,
  onDepartmentChange,
  onCreate,
}: NewConversationDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('messenger.newConversation')}</DialogTitle>
          <DialogDescription>{t('messenger.newConvDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              {t('messenger.driver')}
            </label>
            <Select
              value={driverId}
              onChange={(event) => onDriverChange(event.target.value)}
              disabled={driversLoading || creating}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="">{t('messenger.selectDriver')}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {`${driver.first_name} ${driver.last_name}`.trim()}
                  {driver.employee_number ? ` · ${driver.employee_number}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              {t('messenger.department')}
            </label>
            <Select
              value={department}
              onChange={(event) => onDepartmentChange(event.target.value)}
              disabled={creating}
              className={cn('w-full', FLEET_FILTER_SELECT, BRAND_FOCUS)}
            >
              <option value="dispatch">{t('messenger.dept.dispatch')}</option>
              <option value="hr">{t('messenger.dept.hr')}</option>
              <option value="accounting">{t('messenger.dept.accounting')}</option>
              <option value="maintenance">{t('messenger.dept.maintenance')}</option>
              <option value="general">{t('messenger.dept.general')}</option>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              {t('messenger.subjectOptional')}
            </label>
            <Input
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              placeholder={t('messenger.subjectPlaceholder')}
              disabled={creating}
              className={cn(FLEET_FILTER_INPUT, BRAND_FOCUS)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            {t('messenger.cancel')}
          </Button>
          <Button
            className={BRAND_BTN_PRIMARY}
            onClick={onCreate}
            disabled={creating || !driverId}
          >
            {creating ? t('messenger.creating') : t('messenger.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
