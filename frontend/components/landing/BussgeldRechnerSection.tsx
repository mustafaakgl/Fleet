'use client';

import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  calculatorFontClassName,
  formatEuro,
  sliderFill,
  submitLeadApi,
  submitLeadMailto,
} from './fleet-calculator-shared';
import './fleet-calculator.css';

type Methode = 'papier' | 'excel' | 'software';

const METHODE_FAKTOR: Record<Methode, number> = { papier: 1, excel: 0.75, software: 0.25 };
const WORST_UVV_MAX = 10000;
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;

const RISIKO = {
  hu: { prob: 0.1, kosten: 175 + 320, einheit: 'fzg' as const },
  uvv: { prob: 0.06, kosten: 1200, einheit: 'fzg' as const },
  lizenz: { prob: 0.03, kosten: 2800, einheit: 'fahrer' as const },
};

type BussgeldRechnerSectionProps = {
  leadSource?: string;
};

export function BussgeldRechnerSection({ leadSource = 'bussgeld-rechner' }: BussgeldRechnerSectionProps) {
  const { t } = useTranslation('landing');
  const [fzg, setFzg] = useState(25);
  const [fahrer, setFahrer] = useState(30);
  const [methode, setMethode] = useState<Methode>('papier');
  const [email, setEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const faktor = METHODE_FAKTOR[methode];

  const result = useMemo(() => {
    let gesamt = 0;
    const zeilen: { key: string; wert: number }[] = [];

    for (const key of Object.keys(RISIKO) as Array<keyof typeof RISIKO>) {
      const r = RISIKO[key];
      const basis = r.einheit === 'fzg' ? fzg : fahrer;
      const wert = Math.round(basis * r.prob * r.kosten * faktor);
      gesamt += wert;
      zeilen.push({ key, wert });
    }

    return {
      gesamt,
      proFzg: fzg > 0 ? Math.round(gesamt / fzg) : 0,
      zeilen,
    };
  }, [fzg, fahrer, faktor]);

  const handleLeadSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return;
      }

      const ok = await submitLeadApi({
        email,
        source: leadSource,
        payload: {
          vehicles: fzg,
          drivers: fahrer,
          method: methode,
          estimatedRisk: result.gesamt,
        },
      });

      if (!ok) {
        submitLeadMailto({
          email,
          subject: t('calculator.lead.mailSubject'),
          bodyLines: [
            t('calculator.lead.mailBodyIntro'),
            '',
            `${t('calculator.input.vehicles')}: ${fzg}`,
            `${t('calculator.input.drivers')}: ${fahrer}`,
            `${t('calculator.input.method')}: ${t(`calculator.method.${methode}`)}`,
            `${t('calculator.result.totalLabel')}: ${formatEuro(result.gesamt)}`,
          ],
        });
      }
      setLeadSubmitted(true);
    },
    [email, fahrer, fzg, leadSource, methode, result.gesamt, t],
  );

  return (
    <section
      id="bussgeld-rechner"
      className={`fleet-calculator relative z-10 scroll-mt-20 ${calculatorFontClassName}`}
      aria-labelledby="bussgeld-rechner-title"
    >
      <div className="fahrbahn" aria-hidden="true" />
      <div className="wrap">
        <header>
          <div className="eyebrow">{t('calculator.eyebrow')}</div>
          <h1 id="bussgeld-rechner-title" className="calc-title">
            {t('calculator.title')}
          </h1>
          <p>{t('calculator.subtitle')}</p>
        </header>

        <div className="grid">
          <section className="karte" aria-label={t('calculator.input.cardTitle')}>
            <div className="karte-kopf">
              {t('calculator.input.cardTitle')}
              <span>{t('calculator.input.cardTag')}</span>
            </div>

            <div className="feld">
              <label htmlFor="bussgeld-fzg">{t('calculator.input.vehicles')}</label>
              <div className="hint">{t('calculator.input.vehiclesHint')}</div>
              <div className="slider-row">
                <input
                  type="range"
                  id="bussgeld-fzg"
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  value={fzg}
                  style={{ ['--fill' as string]: sliderFill(fzg, SLIDER_MIN, SLIDER_MAX) }}
                  onChange={(e) => setFzg(Number(e.target.value))}
                />
                <span className="wert">{fzg}</span>
              </div>
            </div>

            <div className="feld">
              <label htmlFor="bussgeld-fahrer">{t('calculator.input.drivers')}</label>
              <div className="hint">{t('calculator.input.driversHint')}</div>
              <div className="slider-row">
                <input
                  type="range"
                  id="bussgeld-fahrer"
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  value={fahrer}
                  style={{ ['--fill' as string]: sliderFill(fahrer, SLIDER_MIN, SLIDER_MAX) }}
                  onChange={(e) => setFahrer(Number(e.target.value))}
                />
                <span className="wert">{fahrer}</span>
              </div>
            </div>

            <div className="feld">
              <label>{t('calculator.input.method')}</label>
              <div className="hint">{t('calculator.input.methodHint')}</div>
              <div className="optionen" role="radiogroup" aria-label={t('calculator.input.method')}>
                {(['papier', 'excel', 'software'] as const).map((value) => (
                  <span key={value}>
                    <input
                      type="radio"
                      name="methode"
                      id={`bussgeld-m-${value}`}
                      value={value}
                      checked={methode === value}
                      onChange={() => setMethode(value)}
                    />
                    <label htmlFor={`bussgeld-m-${value}`}>{t(`calculator.method.${value}`)}</label>
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="bescheid" aria-live="polite" aria-label={t('calculator.result.cardTitle')}>
            <div className="stempel">{t('calculator.result.stamp')}</div>
            <div className="bescheid-kopf">
              <div className="amt">{t('calculator.result.amt')}</div>
              <h2>{t('calculator.result.cardTitle')}</h2>
            </div>

            <div className="summe">
              <div className="label">{t('calculator.result.totalLabel')}</div>
              <div className="euro">{formatEuro(result.gesamt)}</div>
              <div className="pro">
                {t('calculator.result.perVehicle', { amount: formatEuro(result.proFzg) })}
              </div>
            </div>

            <div className="posten">
              {result.zeilen.map(({ key, wert }) => (
                <div key={key} className="posten-zeile">
                  <span className="p-name">
                    {t(`calculator.risks.${key}.name`)}
                    <span className="p-detail">{t(`calculator.risks.${key}.detail`)}</span>
                  </span>
                  <b>{formatEuro(wert)}</b>
                </div>
              ))}
            </div>

            <div className="worstcase">
              <b>{t('calculator.result.worstCase', { amount: formatEuro(WORST_UVV_MAX) })}</b> —{' '}
              {t('calculator.result.worstHint')}
            </div>

            <div className="lead">
              <p>
                <strong>{t('calculator.lead.title')}</strong> — {t('calculator.lead.subtitle')}
              </p>
              {leadSubmitted ? (
                <p className="ok">✓ {t('calculator.lead.success')}</p>
              ) : (
                <form onSubmit={handleLeadSubmit} noValidate>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('calculator.lead.placeholder')}
                    required
                    aria-label={t('calculator.lead.placeholder')}
                  />
                  <button type="submit">{t('calculator.lead.cta')}</button>
                </form>
              )}
            </div>
          </section>
        </div>

        <details>
          <summary>{t('calculator.assumptions.summary')}</summary>
          <ul>
            <li>{t('calculator.assumptions.hu')}</li>
            <li>{t('calculator.assumptions.uvv')}</li>
            <li>{t('calculator.assumptions.license')}</li>
            <li>{t('calculator.assumptions.methods')}</li>
          </ul>
          <div className="disclaimer">{t('calculator.assumptions.disclaimer')}</div>
        </details>
      </div>
    </section>
  );
}
