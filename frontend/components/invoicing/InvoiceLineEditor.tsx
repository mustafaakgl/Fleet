'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FLEET_FILTER_SELECT,
  FLEET_TABLE,
  FLEET_TABLE_BODY,
  FLEET_TABLE_CELL,
  FLEET_TABLE_CELL_MUTED,
  FLEET_TABLE_HEAD,
  FLEET_TABLE_HEADER_ROW,
  FLEET_TABLE_ROW,
} from '@/lib/fleet-table';
import {
  INVOICE_TAX_PRESETS,
  centsToEuro,
  centsToEuroInput,
  euroInputToCents,
  taxPresetByKey,
  taxPresetKey,
} from '@/lib/invoicing-format';
import { formatFleetCurrency } from '@/lib/locale-format';
import type { InvoiceLine, InvoiceLinePayload, InvoiceUnit } from '@/lib/types';

const UNITS: InvoiceUnit[] = ['tour', 'day', 'hour', 'km', 'flat'];

type RowDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
};

function toDraft(line: InvoiceLine): RowDraft {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: centsToEuroInput(line.unitPriceCents),
  };
}

const EMPTY_NEW_LINE: RowDraft & { unit: InvoiceUnit; taxKey: string } = {
  description: '',
  quantity: '1',
  unit: 'tour',
  unitPrice: '0.00',
  taxKey: 'standard',
};

export function InvoiceLineEditor({
  lines,
  editable,
  busy,
  onUpdateLine,
  onDeleteLine,
  onAddLine,
}: {
  lines: InvoiceLine[];
  editable: boolean;
  busy: boolean;
  onUpdateLine: (lineId: string, payload: Partial<InvoiceLinePayload>) => Promise<void>;
  onDeleteLine: (lineId: string) => Promise<void>;
  onAddLine: (payload: InvoiceLinePayload) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [newLine, setNewLine] = useState(EMPTY_NEW_LINE);
  const [newLineError, setNewLineError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(lines.map((line) => [line.id, toDraft(line)])));
  }, [lines]);

  const commitText = async (line: InvoiceLine, field: 'description' | 'quantity') => {
    const draft = drafts[line.id];
    if (!draft) return;
    const value = draft[field].trim();
    if (!value || value === line[field]) return;
    await onUpdateLine(
      line.id,
      field === 'description' ? { description: value } : { quantity: value },
    );
  };

  const commitPrice = async (line: InvoiceLine) => {
    const draft = drafts[line.id];
    if (!draft) return;
    const cents = euroInputToCents(draft.unitPrice);
    if (cents === null || cents === line.unitPriceCents) return;
    await onUpdateLine(line.id, { unitPriceCents: cents });
  };

  const submitNewLine = async () => {
    const description = newLine.description.trim();
    const cents = euroInputToCents(newLine.unitPrice);
    if (!description || cents === null || !newLine.quantity.trim()) {
      setNewLineError(t('invoicing.editor.newLineInvalid'));
      return;
    }
    const preset = taxPresetByKey(newLine.taxKey);
    setNewLineError(null);
    await onAddLine({
      description,
      quantity: newLine.quantity.trim(),
      unit: newLine.unit,
      unitPriceCents: cents,
      taxCategory: preset.taxCategory,
      taxRateBasisPoints: preset.taxRateBasisPoints,
    });
    setNewLine(EMPTY_NEW_LINE);
  };

  return (
    <div className="overflow-x-auto">
      <Table className={FLEET_TABLE}>
        <TableHeader>
          <TableRow className={FLEET_TABLE_HEADER_ROW}>
            <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.editor.colPosition')}</TableHead>
            <TableHead className={FLEET_TABLE_HEAD}>
              {t('invoicing.editor.colDescription')}
            </TableHead>
            <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.editor.colQuantity')}</TableHead>
            <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.editor.colUnit')}</TableHead>
            <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.editor.colUnitPrice')}</TableHead>
            <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.editor.colTax')}</TableHead>
            <TableHead className={FLEET_TABLE_HEAD}>{t('invoicing.editor.colLineNet')}</TableHead>
            {editable ? <TableHead className={FLEET_TABLE_HEAD} /> : null}
          </TableRow>
        </TableHeader>
        <TableBody className={FLEET_TABLE_BODY}>
          {lines.map((line) => {
            const draft = drafts[line.id] ?? toDraft(line);

            return (
              <TableRow key={line.id} className={FLEET_TABLE_ROW}>
                <TableCell className={FLEET_TABLE_CELL_MUTED}>{line.position}</TableCell>
                <TableCell className={FLEET_TABLE_CELL}>
                  {editable ? (
                    <Input
                      value={draft.description}
                      disabled={busy}
                      aria-label={t('invoicing.editor.colDescription')}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [line.id]: { ...draft, description: event.target.value },
                        }))
                      }
                      onBlur={() => void commitText(line, 'description')}
                      className="h-8 text-[13px]"
                    />
                  ) : (
                    line.description
                  )}
                </TableCell>
                <TableCell className={FLEET_TABLE_CELL}>
                  {editable ? (
                    <Input
                      value={draft.quantity}
                      disabled={busy}
                      inputMode="decimal"
                      aria-label={t('invoicing.editor.colQuantity')}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [line.id]: { ...draft, quantity: event.target.value },
                        }))
                      }
                      onBlur={() => void commitText(line, 'quantity')}
                      className="h-8 w-24 text-[13px]"
                    />
                  ) : (
                    line.quantity
                  )}
                </TableCell>
                <TableCell className={FLEET_TABLE_CELL}>
                  {editable ? (
                    <select
                      value={line.unit}
                      disabled={busy}
                      aria-label={t('invoicing.editor.colUnit')}
                      onChange={(event) =>
                        void onUpdateLine(line.id, { unit: event.target.value as InvoiceUnit })
                      }
                      className={FLEET_FILTER_SELECT}
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {t(`invoicing.unit.${unit}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    t(`invoicing.unit.${line.unit}`)
                  )}
                </TableCell>
                <TableCell className={FLEET_TABLE_CELL}>
                  {editable ? (
                    <Input
                      value={draft.unitPrice}
                      disabled={busy}
                      inputMode="decimal"
                      aria-label={t('invoicing.editor.colUnitPrice')}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [line.id]: { ...draft, unitPrice: event.target.value },
                        }))
                      }
                      onBlur={() => void commitPrice(line)}
                      className="h-8 w-28 text-[13px]"
                    />
                  ) : (
                    formatFleetCurrency(centsToEuro(line.unitPriceCents))
                  )}
                </TableCell>
                <TableCell className={FLEET_TABLE_CELL}>
                  {editable ? (
                    <select
                      value={taxPresetKey(line.taxCategory, line.taxRateBasisPoints)}
                      disabled={busy}
                      aria-label={t('invoicing.editor.colTax')}
                      onChange={(event) => {
                        const preset = taxPresetByKey(event.target.value);
                        void onUpdateLine(line.id, {
                          taxCategory: preset.taxCategory,
                          taxRateBasisPoints: preset.taxRateBasisPoints,
                        });
                      }}
                      className={FLEET_FILTER_SELECT}
                    >
                      {INVOICE_TAX_PRESETS.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {t(`invoicing.taxPreset.${preset.key}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    t(`invoicing.taxPreset.${taxPresetKey(line.taxCategory, line.taxRateBasisPoints)}`)
                  )}
                </TableCell>
                <TableCell className={FLEET_TABLE_CELL}>
                  {formatFleetCurrency(centsToEuro(line.netCents))}
                </TableCell>
                {editable ? (
                  <TableCell className={FLEET_TABLE_CELL}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700"
                      disabled={busy || lines.length === 1}
                      aria-label={t('invoicing.editor.removeLine')}
                      title={
                        lines.length === 1
                          ? t('invoicing.editor.lastLineHint')
                          : t('invoicing.editor.removeLine')
                      }
                      onClick={() => void onDeleteLine(line.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}

          {editable ? (
            <TableRow className={FLEET_TABLE_ROW}>
              <TableCell className={FLEET_TABLE_CELL_MUTED}>{lines.length + 1}</TableCell>
              <TableCell className={FLEET_TABLE_CELL}>
                <Input
                  value={newLine.description}
                  disabled={busy}
                  placeholder={t('invoicing.editor.newLinePlaceholder')}
                  aria-label={t('invoicing.editor.newLinePlaceholder')}
                  onChange={(event) =>
                    setNewLine((current) => ({ ...current, description: event.target.value }))
                  }
                  className="h-8 text-[13px]"
                />
              </TableCell>
              <TableCell className={FLEET_TABLE_CELL}>
                <Input
                  value={newLine.quantity}
                  disabled={busy}
                  inputMode="decimal"
                  aria-label={t('invoicing.editor.colQuantity')}
                  onChange={(event) =>
                    setNewLine((current) => ({ ...current, quantity: event.target.value }))
                  }
                  className="h-8 w-24 text-[13px]"
                />
              </TableCell>
              <TableCell className={FLEET_TABLE_CELL}>
                <select
                  value={newLine.unit}
                  disabled={busy}
                  aria-label={t('invoicing.editor.colUnit')}
                  onChange={(event) =>
                    setNewLine((current) => ({
                      ...current,
                      unit: event.target.value as InvoiceUnit,
                    }))
                  }
                  className={FLEET_FILTER_SELECT}
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(`invoicing.unit.${unit}`)}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell className={FLEET_TABLE_CELL}>
                <Input
                  value={newLine.unitPrice}
                  disabled={busy}
                  inputMode="decimal"
                  aria-label={t('invoicing.editor.colUnitPrice')}
                  onChange={(event) =>
                    setNewLine((current) => ({ ...current, unitPrice: event.target.value }))
                  }
                  className="h-8 w-28 text-[13px]"
                />
              </TableCell>
              <TableCell className={FLEET_TABLE_CELL}>
                <select
                  value={newLine.taxKey}
                  disabled={busy}
                  aria-label={t('invoicing.editor.colTax')}
                  onChange={(event) =>
                    setNewLine((current) => ({ ...current, taxKey: event.target.value }))
                  }
                  className={FLEET_FILTER_SELECT}
                >
                  {INVOICE_TAX_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {t(`invoicing.taxPreset.${preset.key}`)}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell className={FLEET_TABLE_CELL} colSpan={2}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void submitNewLine()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {t('invoicing.editor.addLine')}
                </Button>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {newLineError ? (
        <p className="px-3 py-2 text-xs text-red-600">{newLineError}</p>
      ) : null}
    </div>
  );
}
