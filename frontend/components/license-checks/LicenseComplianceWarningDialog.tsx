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

type LicenseComplianceWarningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  loading?: boolean;
};

export function LicenseComplianceWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  loading = false,
}: LicenseComplianceWarningDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assignmentForm.licenseWarningTitle')}</DialogTitle>
          <DialogDescription>{t('assignmentForm.licenseWarningMessage')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={loading}
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
          >
            {t('assignmentForm.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={loading} onClick={onConfirm}>
            {t('assignmentForm.licenseWarningConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
