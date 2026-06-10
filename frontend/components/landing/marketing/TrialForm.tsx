'use client';

import { FormEvent, useState } from 'react';
import { submitLeadApi } from '../fleet-calculator-shared';
import { TRIAL_CTA_LABEL } from './marketing-config';

const FLEET_OPTIONS = [
  { value: '1-9', label: '1–9 Fahrzeuge' },
  { value: '10-20', label: '10–20 Fahrzeuge' },
  { value: '21-50', label: '21–50 Fahrzeuge' },
  { value: '51-100', label: '51–100 Fahrzeuge' },
  { value: '100+', label: 'Über 100 Fahrzeuge' },
] as const;

export function TrialForm() {
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLInputElement | HTMLSelectElement>(':invalid');
      firstInvalid?.reportValidity();
      firstInvalid?.focus();
      return;
    }

    setSubmitting(true);
    await submitLeadApi({
      email,
      source: 'homepage-trial',
      payload: {
        company: company.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        fleetSize,
      },
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="m-trial-form">
        <div className="m-tf-erfolg">
          <div className="m-haken">✓</div>
          <h3>Geschafft — wir melden uns!</h3>
          <p>
            Sie erhalten in wenigen Minuten eine E-Mail mit Ihrem Zugang.
            <br />
            Fragen vorab? Schreiben Sie uns einfach per WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="m-trial-form">
      <form id="trialForm" noValidate onSubmit={handleSubmit}>
        <div className="m-tf-grid">
          <div className="m-voll">
            <label htmlFor="tf-firma">Firma *</label>
            <input
              type="text"
              id="tf-firma"
              required
              autoComplete="organization"
              placeholder="Mustermann Transporte GmbH"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tf-name">Ihr Name *</label>
            <input
              type="text"
              id="tf-name"
              required
              autoComplete="name"
              placeholder="Max Mustermann"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tf-tel">Telefon (optional)</label>
            <input
              type="tel"
              id="tf-tel"
              autoComplete="tel"
              placeholder="+49 …"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="m-voll">
            <label htmlFor="tf-email">Geschäftliche E-Mail *</label>
            <input
              type="email"
              id="tf-email"
              required
              autoComplete="email"
              placeholder="max@mustermann-transporte.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="m-voll">
            <label htmlFor="tf-flotte">Flottengröße *</label>
            <select
              id="tf-flotte"
              required
              value={fleetSize}
              onChange={(e) => setFleetSize(e.target.value)}
            >
              <option value="" disabled>
                Bitte wählen…
              </option>
              {FLEET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="m-btn m-btn-primary" disabled={submitting} data-track="trial-form-submit">
          {submitting ? 'Wird gesendet…' : TRIAL_CTA_LABEL}
        </button>
        <p className="m-tf-note">
          Keine Kreditkarte nötig · Test endet automatisch · DSGVO-konform, Daten auf deutschen Servern
        </p>
      </form>
    </div>
  );
}
