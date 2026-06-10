'use client';

import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calculatorFontClassName, submitLeadApi, submitLeadMailto } from './fleet-calculator-shared';
import './fleet-calculator.css';

type VehicleType = 'lkw_schwer' | 'lkw_leicht' | 'anhaenger' | 'pkw';

type VehicleEntry = {
  id: string;
  kz: string;
  typ: VehicleType;
  hu: string;
  uvv: string;
};

type DeadlineStatus = 'overdue' | 'soon' | 'ok';

const PRUEF_REGELN: Record<VehicleType, { hu: number; sp: number | null; uvv: number }> = {
  lkw_schwer: { hu: 12, sp: 6, uvv: 12 },
  lkw_leicht: { hu: 24, sp: null, uvv: 12 },
  anhaenger: { hu: 12, sp: null, uvv: 12 },
  pkw: { hu: 24, sp: null, uvv: 12 },
};

const BALD_TAGE = 60;

function addMonate(isoMonat: string, monate: number): Date | null {
  if (!isoMonat) return null;
  const [year, month] = isoMonat.split('-').map(Number);
  return new Date(year, month - 1 + monate, 1);
}

function formatDeadline(date: Date): string {
  return date.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
}

function deadlineStatus(due: Date | null): DeadlineStatus | null {
  if (!due) return null;
  const today = new Date();
  today.setDate(1);
  const days = (due.getTime() - today.getTime()) / 86400000;
  if (days < 0) return 'overdue';
  if (days < BALD_TAGE) return 'soon';
  return 'ok';
}

function statusBadgeClass(status: DeadlineStatus): string {
  if (status === 'overdue') return 'b-faellig';
  if (status === 'soon') return 'b-bald';
  return 'b-ok';
}

let nextVehicleId = 0;

type TuevUvvCheckerSectionProps = {
  leadSource?: string;
};

export function TuevUvvCheckerSection({ leadSource = 'tuev-checker' }: TuevUvvCheckerSectionProps) {
  const { t } = useTranslation('landing');
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const [kz, setKz] = useState('');
  const [typ, setTyp] = useState<VehicleType>('lkw_schwer');
  const [hu, setHu] = useState('');
  const [uvv, setUvv] = useState('');
  const [email, setEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const criticalCount = useMemo(() => {
    let count = 0;
    for (const vehicle of vehicles) {
      const rule = PRUEF_REGELN[vehicle.typ];
      const deadlines = [
        addMonate(vehicle.hu, rule.hu),
        rule.sp ? addMonate(vehicle.hu, rule.sp) : null,
        addMonate(vehicle.uvv, rule.uvv),
      ];
      for (const deadline of deadlines) {
        const status = deadlineStatus(deadline);
        if (status && status !== 'ok') count += 1;
      }
    }
    return count;
  }, [vehicles]);

  const handleAdd = useCallback(() => {
    if (!hu && !uvv) return;
    nextVehicleId += 1;
    setVehicles((current) => [
      ...current,
      {
        id: `v-${nextVehicleId}`,
        kz: kz.trim().toUpperCase(),
        typ,
        hu,
        uvv,
      },
    ]);
    setKz('');
  }, [hu, kz, typ, uvv]);

  const handleRemove = useCallback((id: string) => {
    setVehicles((current) => current.filter((vehicle) => vehicle.id !== id));
  }, []);

  const handleLeadSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return;
      }

      const vehicleLines = vehicles.map((vehicle) => {
        const typeLabel = t(`deadlineChecker.vehicleTypes.${vehicle.typ}`);
        return `- ${vehicle.kz || '—'} (${typeLabel}), HU: ${vehicle.hu || '—'}, UVV: ${vehicle.uvv || '—'}`;
      });

      const ok = await submitLeadApi({
        email,
        source: leadSource,
        payload: {
          vehicleCount: vehicles.length,
          criticalDeadlines: criticalCount,
          vehicles: vehicles.map((v) => ({
            plate: v.kz,
            type: v.typ,
            lastHu: v.hu,
            lastUvv: v.uvv,
          })),
        },
      });

      if (!ok) {
        submitLeadMailto({
          email,
          subject: t('deadlineChecker.lead.mailSubject'),
          bodyLines: [
            t('deadlineChecker.lead.mailBodyIntro'),
            '',
            `${t('deadlineChecker.result.count', { count: vehicles.length })}`,
            ...vehicleLines,
          ],
        });
      }
      setLeadSubmitted(true);
    },
    [criticalCount, email, leadSource, t, vehicles],
  );

  return (
    <section
      id="tuev-uvv-checker"
      className={`fleet-calculator relative z-10 scroll-mt-20 ${calculatorFontClassName}`}
      aria-labelledby="tuev-uvv-checker-title"
    >
      <div className="fahrbahn" aria-hidden="true" />
      <div className="wrap">
        <header>
          <div className="eyebrow">{t('deadlineChecker.eyebrow')}</div>
          <h1 id="tuev-uvv-checker-title" className="calc-title">
            {t('deadlineChecker.title')}
          </h1>
          <p>{t('deadlineChecker.subtitle')}</p>
        </header>

        <section className="karte karte-stack">
          <div className="karte-kopf">
            {t('deadlineChecker.input.cardTitle')}
            <span>{t('deadlineChecker.input.cardTag')}</span>
          </div>
          <div className="eingabe">
            <div>
              <label htmlFor="tuev-kz">{t('deadlineChecker.input.plate')}</label>
              <input
                type="text"
                id="tuev-kz"
                className="kz-input"
                value={kz}
                onChange={(e) => setKz(e.target.value)}
                placeholder={t('deadlineChecker.input.platePlaceholder')}
                maxLength={12}
              />
            </div>
            <div>
              <label htmlFor="tuev-typ">{t('deadlineChecker.input.type')}</label>
              <select id="tuev-typ" value={typ} onChange={(e) => setTyp(e.target.value as VehicleType)}>
                {(['lkw_schwer', 'lkw_leicht', 'anhaenger', 'pkw'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`deadlineChecker.vehicleTypes.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tuev-hu">{t('deadlineChecker.input.lastHu')}</label>
              <input type="month" id="tuev-hu" value={hu} onChange={(e) => setHu(e.target.value)} />
            </div>
            <div>
              <label htmlFor="tuev-uvv">{t('deadlineChecker.input.lastUvv')}</label>
              <input type="month" id="tuev-uvv" value={uvv} onChange={(e) => setUvv(e.target.value)} />
            </div>
            <button type="button" className="btn-add" onClick={handleAdd}>
              {t('deadlineChecker.input.add')}
            </button>
          </div>

          <div className="karte-kopf">
            {t('deadlineChecker.result.listTitle')}
            <span>{t('deadlineChecker.result.count', { count: vehicles.length })}</span>
          </div>

          <div className="liste">
            {vehicles.length === 0 ? (
              <div className="leer">{t('deadlineChecker.result.empty')}</div>
            ) : (
              vehicles.map((vehicle) => {
                const rule = PRUEF_REGELN[vehicle.typ];
                const nextHu = addMonate(vehicle.hu, rule.hu);
                const nextSp = rule.sp ? addMonate(vehicle.hu, rule.sp) : null;
                const nextUvv = addMonate(vehicle.uvv, rule.uvv);

                const deadlines = [
                  { key: 'hu', label: t('deadlineChecker.deadlines.hu'), due: nextHu },
                  { key: 'sp', label: t('deadlineChecker.deadlines.sp'), due: nextSp },
                  { key: 'uvv', label: t('deadlineChecker.deadlines.uvv'), due: nextUvv },
                ] as const;

                return (
                  <div key={vehicle.id} className="fzg-zeile">
                    <div className="kz-schild">{vehicle.kz || '—'}</div>
                    <div className="fristen">
                      {deadlines.map(({ key, label, due }) => {
                        if (!due) return null;
                        const status = deadlineStatus(due);
                        if (!status) return null;
                        return (
                          <div key={key} className="frist">
                            <div className="f-name">{label}</div>
                            <div className="f-datum">
                              {formatDeadline(due)}
                              <span className={`badge ${statusBadgeClass(status)}`}>
                                {t(`deadlineChecker.status.${status}`)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="btn-del"
                      onClick={() => handleRemove(vehicle.id)}
                      aria-label={t('deadlineChecker.input.remove')}
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className={`lead ${vehicles.length > 0 ? 'lead-visible' : 'lead-hidden'}`}>
            <p>
              <strong>
                {criticalCount > 0
                  ? t('deadlineChecker.lead.critical', { count: criticalCount })
                  : t('deadlineChecker.lead.allOk')}
              </strong>{' '}
              {t('deadlineChecker.lead.subtitle')}
            </p>
            {leadSubmitted ? (
              <p className="ok">✓ {t('deadlineChecker.lead.success')}</p>
            ) : (
              <form onSubmit={handleLeadSubmit} noValidate>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('deadlineChecker.lead.placeholder')}
                  required
                  aria-label={t('deadlineChecker.lead.placeholder')}
                />
                <button type="submit">{t('deadlineChecker.lead.cta')}</button>
              </form>
            )}
          </div>
        </section>

        <details className="no-margin-top">
          <summary>{t('deadlineChecker.assumptions.summary')}</summary>
          <ul>
            <li>{t('deadlineChecker.assumptions.hu')}</li>
            <li>{t('deadlineChecker.assumptions.sp')}</li>
            <li>{t('deadlineChecker.assumptions.uvv')}</li>
          </ul>
          <div className="disclaimer">{t('deadlineChecker.assumptions.disclaimer')}</div>
        </details>
      </div>
    </section>
  );
}
