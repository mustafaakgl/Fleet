'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldQuestion } from 'lucide-react';
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
import {
  MIN_OVERRIDE_NOTE_LENGTH,
  allDeclarationsComplete,
  checkLabelKey,
  isDeclarationComplete,
  reasonLabelKey,
  type DeclarationDraft,
} from '@/lib/dispatch-view';
import type { DispatchCheckView } from '@/lib/types';

interface OverrideDeclarationDialogProps {
  open: boolean;
  /** Beyan BEKLEYEN kontroller — `incompatible` olanlar BURAYA GIRMEZ. */
  checks: readonly DispatchCheckView[];
  drafts: Record<string, DeclarationDraft>;
  onChange: (code: string, draft: DeclarationDraft) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * KAPSAMLI DIS DOGRULAMA BEYANI (Faz 17g).
 *
 * NE ZAMAN ACILIR: sunucu bir kontrolu `unknown` isaretlemis ve o kontrol bir
 * BEYANLA asilabiliyorsa. Repoda kanonik kalan-surus-suresi verisi olmadigi
 * icin `driver_drive_time` DAIMA `unknown` gelir — yani her dispatch bir
 * insan beyani gerektirir ve bu dialog operasyonun normal parcasidir, bir
 * istisna degil.
 *
 * NEDEN "KAPSAMLI": bos ya da "ok" gibi bir metin beyan SAYILMAZ. Beyan veren
 * kisi NEYI dogruladigini yazmali — cunku kaydedilen sey bir onay kutusu
 * degil, bir SORUMLULUK USTLENIMI: kim, ne zaman, hangi kontrol icin ne dedi.
 *
 * `incompatible` KONTROLLER BURADA GORUNMEZ. Yasal engeller (ehliyet suresi,
 * arac bakimda, kapasite yetmiyor) bir beyanla gecilemez ve gecilebilirmis
 * gibi bir alan gostermek, sunucunun reddedecegi bir seyi mumkun gostermek
 * olurdu.
 *
 * ERISILEBILIRLIK: Radix `Dialog` odagi iceride tutuyor, `Esc` kapatiyor ve
 * baslik/aciklama `aria-labelledby`/`aria-describedby` ile bagli. Acildiginda
 * odak ilk alana gidiyor.
 */
export function OverrideDeclarationDialog({
  open,
  checks,
  drafts,
  onChange,
  onConfirm,
  onCancel,
}: OverrideDeclarationDialogProps) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) setTouched({});
  }, [open]);

  const complete = useMemo(() => allDeclarationsComplete(checks, drafts), [checks, drafts]);

  const draftFor = useCallback(
    (code: string): DeclarationDraft => drafts[code] ?? { note: '', answer: '' },
    [drafts],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto"
        data-testid="override-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldQuestion className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            {t('dispatch.override.title')}
          </DialogTitle>
          <DialogDescription>{t('dispatch.override.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {checks.map((check, index) => {
            const draft = draftFor(check.code);
            const labelKey = checkLabelKey(check.code);
            const noteId = `override-note-${check.code}`;
            const groupId = `override-choice-${check.code}`;
            const invalid = touched[check.code] && !isDeclarationComplete(draft);

            return (
              <section
                key={check.code}
                className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
                aria-labelledby={`${groupId}-legend`}
              >
                <div>
                  <h3 id={`${groupId}-legend`} className="text-sm font-semibold text-amber-900">
                    {/* Bilinmeyen kod GIZLENMIYOR: sunucu yeni bir kontrol
                        eklediginde dispatcher onu ham koduyla da gormeli. */}
                    {labelKey ? t(labelKey) : check.code}
                  </h3>
                  <p className="text-xs text-amber-900">{t(reasonLabelKey(check.reasonKey))}</p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium text-amber-900">
                    {t('dispatch.override.choiceLegend')}
                  </legend>
                  <div className="flex flex-wrap gap-4">
                    {(['yes', 'no'] as const).map((answer) => {
                      const id = `${groupId}-${answer}`;
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <input
                            id={id}
                            data-testid={id}
                            type="radio"
                            name={groupId}
                            className="h-4 w-4 border-amber-400 text-[#1a4d7a] focus:ring-2 focus:ring-[#1a4d7a]"
                            checked={draft.answer === answer}
                            onChange={() => {
                              setTouched((previous) => ({ ...previous, [check.code]: true }));
                              onChange(check.code, { ...draft, answer });
                            }}
                          />
                          <label htmlFor={id} className="text-sm text-amber-900">
                            {t(`dispatch.override.answer.${answer}`)}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="space-y-1">
                  <label htmlFor={noteId} className="block text-xs font-medium text-amber-900">
                    {t('dispatch.override.noteLabel')}
                  </label>
                  <textarea
                    id={noteId}
                    data-testid={noteId}
                    rows={3}
                    autoFocus={index === 0}
                    className="w-full rounded-md border border-amber-300 bg-white px-2 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-[#1a4d7a]"
                    value={draft.note}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={`${noteId}-hint`}
                    onChange={(event) => {
                      setTouched((previous) => ({ ...previous, [check.code]: true }));
                      onChange(check.code, { ...draft, note: event.target.value });
                    }}
                    onBlur={() => setTouched((previous) => ({ ...previous, [check.code]: true }))}
                  />
                  <p id={`${noteId}-hint`} className="text-xs text-amber-900">
                    {t('dispatch.override.noteHint', { min: MIN_OVERRIDE_NOTE_LENGTH })}
                  </p>
                  {invalid ? (
                    <p role="alert" className="text-xs font-medium text-red-700">
                      {t('dispatch.override.incomplete')}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}

          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('dispatch.override.responsibility')}</span>
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t('dispatch.override.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={!complete} data-testid="override-confirm">
            {t('dispatch.override.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
