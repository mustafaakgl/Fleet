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

const KOSTEN = {
  afaSatz: 0.15,
  laufend: 6000,
};

type FahrtenbuchSteuerrechnerSectionProps = {
  leadSource?: string;
};

export function FahrtenbuchSteuerrechnerSection({
  leadSource = 'fahrtenbuch',
}: FahrtenbuchSteuerrechnerSectionProps) {
  const { t } = useTranslation('landing');
  const [fzg, setFzg] = useState(6);
  const [blp, setBlp] = useState(45000);
  const [privat, setPrivat] = useState(15);
  const [steuer, setSteuer] = useState(40);
  const [email, setEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  const result = useMemo(() => {
    const privatAnteil = privat / 100;
    const steuerSatz = steuer / 100;

    const regelProFzg = blp * 0.01 * 12;
    const kosten = blp * KOSTEN.afaSatz + KOSTEN.laufend;
    const fbProFzg = kosten * privatAnteil;
    const ersparnisProFzg = Math.max(0, (regelProFzg - fbProFzg) * steuerSatz);
    const gesamt = Math.round(ersparnisProFzg * fzg);

    const regelTotal = regelProFzg * fzg;
    const fbTotal = fbProFzg * fzg;
    const max = Math.max(regelTotal, fbTotal) || 1;

    return {
      gesamt,
      ersparnisProFzg: Math.round(ersparnisProFzg),
      regelTotal: Math.round(regelTotal),
      fbTotal: Math.round(fbTotal),
      regelBarWidth: (regelTotal / max) * 100,
      fbBarWidth: Math.max(8, (fbTotal / max) * 100),
      privatAnteil,
    };
  }, [blp, fzg, privat, steuer]);

  const proText =
    result.gesamt > 0
      ? t('taxCalculator.result.perVehicleSaving', {
          amount: formatEuro(result.ersparnisProFzg),
          percent: Math.round(result.privatAnteil * 100),
        })
      : t('taxCalculator.result.perVehicleNoSaving');

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
          listPrice: blp,
          privateSharePercent: privat,
          taxRatePercent: steuer,
          estimatedSavings: result.gesamt,
        },
      });

      if (!ok) {
        submitLeadMailto({
          email,
          subject: t('taxCalculator.lead.mailSubject'),
          bodyLines: [
            t('taxCalculator.lead.mailBodyIntro'),
            '',
            `${t('taxCalculator.input.vehicles')}: ${fzg}`,
            `${t('taxCalculator.input.listPrice')}: ${formatEuro(blp)}`,
            `${t('taxCalculator.input.privateShare')}: ${privat} %`,
            `${t('taxCalculator.input.taxRate')}: ${steuer} %`,
            `${t('taxCalculator.result.totalLabel')}: ${formatEuro(result.gesamt)}`,
          ],
        });
      }
      setLeadSubmitted(true);
    },
    [blp, email, fzg, leadSource, privat, result.gesamt, steuer, t],
  );

  return (
    <section
      id="fahrtenbuch-rechner"
      className={`fleet-calculator relative z-10 scroll-mt-20 ${calculatorFontClassName}`}
      aria-labelledby="fahrtenbuch-rechner-title"
    >
      <div className="fahrbahn" aria-hidden="true" />
      <div className="wrap">
        <header>
          <div className="eyebrow">{t('taxCalculator.eyebrow')}</div>
          <h1 id="fahrtenbuch-rechner-title" className="calc-title">
            {t('taxCalculator.title')}
          </h1>
          <p>{t('taxCalculator.subtitle')}</p>
        </header>

        <div className="grid">
          <section className="karte" aria-label={t('taxCalculator.input.cardTitle')}>
            <div className="karte-kopf">
              {t('taxCalculator.input.cardTitle')}
              <span>{t('taxCalculator.input.cardTag')}</span>
            </div>

            <div className="feld">
              <label htmlFor="steuer-fzg">{t('taxCalculator.input.vehicles')}</label>
              <div className="hint">{t('taxCalculator.input.vehiclesHint')}</div>
              <div className="slider-row">
                <input
                  type="range"
                  id="steuer-fzg"
                  min={1}
                  max={50}
                  value={fzg}
                  style={{ ['--fill' as string]: sliderFill(fzg, 1, 50) }}
                  onChange={(e) => setFzg(Number(e.target.value))}
                />
                <span className="wert">{fzg}</span>
              </div>
            </div>

            <div className="feld">
              <label htmlFor="steuer-blp">{t('taxCalculator.input.listPrice')}</label>
              <div className="hint">{t('taxCalculator.input.listPriceHint')}</div>
              <div className="slider-row">
                <input
                  type="range"
                  id="steuer-blp"
                  min={20000}
                  max={90000}
                  step={1000}
                  value={blp}
                  style={{ ['--fill' as string]: sliderFill(blp, 20000, 90000) }}
                  onChange={(e) => setBlp(Number(e.target.value))}
                />
                <span className="wert wert-wide">{formatEuro(blp)}</span>
              </div>
            </div>

            <div className="feld">
              <label htmlFor="steuer-privat">{t('taxCalculator.input.privateShare')}</label>
              <div className="hint">{t('taxCalculator.input.privateShareHint')}</div>
              <div className="slider-row">
                <input
                  type="range"
                  id="steuer-privat"
                  min={5}
                  max={50}
                  value={privat}
                  style={{ ['--fill' as string]: sliderFill(privat, 5, 50) }}
                  onChange={(e) => setPrivat(Number(e.target.value))}
                />
                <span className="wert wert-wide">{privat} %</span>
              </div>
            </div>

            <div className="feld">
              <label htmlFor="steuer-steuer">{t('taxCalculator.input.taxRate')}</label>
              <div className="hint">{t('taxCalculator.input.taxRateHint')}</div>
              <div className="slider-row">
                <input
                  type="range"
                  id="steuer-steuer"
                  min={25}
                  max={47}
                  value={steuer}
                  style={{ ['--fill' as string]: sliderFill(steuer, 25, 47) }}
                  onChange={(e) => setSteuer(Number(e.target.value))}
                />
                <span className="wert wert-wide">{steuer} %</span>
              </div>
            </div>
          </section>

          <section className="bescheid" aria-live="polite" aria-label={t('taxCalculator.result.cardTitle')}>
            <div className="stempel stempel-gruen">{t('taxCalculator.result.stamp')}</div>
            <div className="bescheid-kopf">
              <div className="amt">{t('taxCalculator.result.amt')}</div>
              <h2>{t('taxCalculator.result.cardTitle')}</h2>
            </div>

            <div className="vergleich">
              <div className="balken">
                <div className="b-label">
                  <span>{t('taxCalculator.result.ruleLabel')}</span>
                  <b>{formatEuro(result.regelTotal)}</b>
                </div>
                <div className="b-track">
                  <div className="b-fill b-fill-regel" style={{ width: `${result.regelBarWidth}%` }}>
                    {t('taxCalculator.result.ruleBar')}
                  </div>
                </div>
              </div>
              <div className="balken">
                <div className="b-label">
                  <span>{t('taxCalculator.result.logbookLabel')}</span>
                  <b>{formatEuro(result.fbTotal)}</b>
                </div>
                <div className="b-track">
                  <div className="b-fill b-fill-fb" style={{ width: `${result.fbBarWidth}%` }}>
                    {t('taxCalculator.result.logbookBar')}
                  </div>
                </div>
              </div>
            </div>

            <div className="summe summe-compact">
              <div className="label">{t('taxCalculator.result.totalLabel')}</div>
              <div className="euro euro-gruen">{formatEuro(result.gesamt)}</div>
              <div className="pro">{proText}</div>
            </div>

            <div className="lead">
              <p>
                <strong>{t('taxCalculator.lead.title')}</strong> — {t('taxCalculator.lead.subtitle')}
              </p>
              {leadSubmitted ? (
                <p className="ok">✓ {t('taxCalculator.lead.success')}</p>
              ) : (
                <form onSubmit={handleLeadSubmit} noValidate>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('taxCalculator.lead.placeholder')}
                    required
                    aria-label={t('taxCalculator.lead.placeholder')}
                  />
                  <button type="submit">{t('taxCalculator.lead.cta')}</button>
                </form>
              )}
            </div>
          </section>
        </div>

        <details>
          <summary>{t('taxCalculator.assumptions.summary')}</summary>
          <ul>
            <li>{t('taxCalculator.assumptions.rule')}</li>
            <li>{t('taxCalculator.assumptions.logbook')}</li>
            <li>{t('taxCalculator.assumptions.savings')}</li>
          </ul>
          <div className="disclaimer">{t('taxCalculator.assumptions.disclaimer')}</div>
        </details>
      </div>
    </section>
  );
}
