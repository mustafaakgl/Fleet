'use client';

import { useState, type ReactNode } from 'react';

type TourTabId = 'p-plan' | 'p-uebergabe' | 'p-gps' | 'p-dash';

const tabs: { id: TourTabId; label: string }[] = [
  { id: 'p-plan', label: 'Einsatzplan' },
  { id: 'p-uebergabe', label: 'Fahrzeugübergabe' },
  { id: 'p-gps', label: 'GPS & Touren' },
  { id: 'p-dash', label: 'Dashboard' },
];

const planRows = [
  { driver: 'P. Kowalski', plate: 'M-TR 119', company: 'Logistik Nord GmbH' },
  { driver: 'A. Yılmaz', plate: 'M-KL 482', company: 'BauTrans Süd' },
  { driver: 'M. Ionescu', plate: 'M-FX 207', company: 'Logistik Nord GmbH' },
  { driver: 'S. Weber', plate: 'M-PQ 951', company: 'Hafen Express' },
];

const barHeights = ['40%', '55%', '48%', '78%', '62%', '90%', '70%'];

function EinsatzplanMock() {
  return (
    <div className="m-mock-box">
      <div className="m-mock-titel">
        Einsatzplan · Morgen <b>Do, 11.06.</b>
      </div>
      {planRows.map((row) => (
        <div key={row.driver} className="m-plan-zeile">
          <span className="m-plan-fahrer">{row.driver}</span>
          <span className="m-plan-kennz">{row.plate}</span>
          <span className="m-plan-firma">{row.company}</span>
        </div>
      ))}
    </div>
  );
}

function UebergabeMock() {
  return (
    <div className="m-mock-box">
      <div className="m-mock-titel">
        Übergabe · M-KL 482 <b>07:42</b>
      </div>
      <div className="m-foto-grid">
        <div className="m-foto-slot" />
        <div className="m-foto-slot" />
        <div className="m-foto-slot" />
        <div className="m-foto-slot" />
      </div>
      <div className="m-check-zeile">
        <span>Front &amp; Heck dokumentiert</span>
        <span className="m-ok">✓ OK</span>
      </div>
      <div className="m-check-zeile">
        <span>Seiten dokumentiert</span>
        <span className="m-ok">✓ OK</span>
      </div>
      <div className="m-check-zeile">
        <span>Neuer Schaden gemeldet</span>
        <span className="m-achtung">! Kratzer hinten links</span>
      </div>
    </div>
  );
}

function GpsMock() {
  return (
    <div className="m-mock-box">
      <div className="m-mock-titel">
        Tour · M-TR 119 <b>Heute</b>
      </div>
      <div className="m-route-karte">
        <svg viewBox="0 0 400 170" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M30 140 C 90 120, 110 60, 180 70 S 300 110, 370 35"
            fill="none"
            stroke="#15498A"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="30" cy="140" r="7" fill="#1E7B43" />
          <circle cx="370" cy="35" r="7" fill="#F7C600" stroke="#13202F" strokeWidth="2" />
        </svg>
      </div>
      <div className="m-route-info">
        <div>
          <b>247 km</b>
          <span>Strecke heute</span>
        </div>
        <div>
          <b>6:12 h</b>
          <span>Fahrzeit</span>
        </div>
        <div>
          <b>17:30</b>
          <span>Schicht beendet · Ortung aus</span>
        </div>
      </div>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="m-mock-box">
      <div className="m-mock-titel">
        Flotten-Dashboard <b>Live</b>
      </div>
      <div className="m-dash-kpis">
        <div className="m-dash-kpi">
          <b>68/70</b>
          <span>Fahrzeuge einsatzbereit</span>
          <span className="m-trend">▲ 97 % Verfügbarkeit</span>
        </div>
        <div className="m-dash-kpi">
          <b className="m-dash-warn">3</b>
          <span>Fristen kritisch</span>
          <span className="m-trend m-trend-schlecht">Handeln erforderlich</span>
        </div>
        <div className="m-dash-kpi">
          <b>12.480</b>
          <span>km diese Woche</span>
          <span className="m-trend">▲ 4 % zur Vorwoche</span>
        </div>
        <div className="m-dash-kpi">
          <b>2</b>
          <span>Offene Schäden</span>
          <span className="m-trend">▼ 5 weniger als im Mai</span>
        </div>
      </div>
      <div className="m-balken-mini">
        {barHeights.map((height, index) => (
          <i key={index} className={index === 3 || index === 5 ? 'm-hoch' : undefined} style={{ height }} />
        ))}
      </div>
    </div>
  );
}

const panelContent: Record<
  TourTabId,
  { title: string; body: string; bullets: string[]; mock: () => ReactNode }
> = {
  'p-plan': {
    title: 'Morgen früh weiß jeder, wo er hinfährt.',
    body: 'Planen Sie abends in Minuten: Wer fährt welches Fahrzeug für welchen Auftraggeber? Jeder Fahrer sieht seinen Einsatz in der App — in seiner Sprache.',
    bullets: [
      'Tagesplan per Drag & Drop',
      'Fahrer bestätigt morgens Firma & Kennzeichen in der App',
      'Auftraggeber erhalten die Einsatzliste automatisch per E-Mail',
    ],
    mock: EinsatzplanMock,
  },
  'p-uebergabe': {
    title: 'Schützen Sie Ihr Fahrzeug — bei jeder Übergabe.',
    body: 'Vor jeder Übernahme dokumentiert der Fahrer den Zustand mit Fotos. Kein Streit mehr, wer den Kratzer verursacht hat — alles ist belegt, mit Zeitstempel.',
    bullets: [
      'Foto-Pflicht vor Fahrtantritt, in 60 Sekunden erledigt',
      'Schäden sofort gemeldet, automatisch in der Fahrzeugakte',
      'Lückenlose Historie: wer, wann, welcher Zustand',
    ],
    mock: UebergabeMock,
  },
  'p-gps': {
    title: 'Touren & Kilometer — ohne Hardware.',
    body: 'Die Fahrer-App erfasst Touren automatisch während der Schicht. DSGVO-konform: Nach Feierabend ist die Ortung aus — garantiert und für den Fahrer sichtbar.',
    bullets: [
      'Automatische Tourenerfassung per Smartphone',
      'Kilometerstände für jedes Fahrzeug, immer aktuell',
      'Ortung endet mit der Schicht — Vertrauen statt Überwachung',
    ],
    mock: GpsMock,
  },
  'p-dash': {
    title: 'Ihre Flotte auf einen Blick — jeden Morgen.',
    body: 'Öffnen Sie ein Dashboard statt zehn Ordner: Fristen, Fahrzeugstatus, offene Schäden und Auslastung — live und ohne Suchen.',
    bullets: [
      'Kritische Fristen immer ganz oben',
      'Auslastung & Kilometer pro Fahrzeug',
      'Offene Schäden und Werkstatt-Termine im Blick',
    ],
    mock: DashboardMock,
  },
};

export function ProductTour() {
  const [activeTab, setActiveTab] = useState<TourTabId>('p-plan');
  const panel = panelContent[activeTab];
  const Mock = panel.mock;

  return (
    <section className="m-section m-tour-section">
      <div className="m-wrap">
        <span className="m-eyebrow">Ein Blick ins Produkt</span>
        <h2 className="m-h2">
          Vom Einsatzplan bis zur Übergabe —
          <br />
          alles an einem Ort.
        </h2>

        <div className="m-tour-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`m-tour-tab${activeTab === tab.id ? ' m-tour-tab-aktiv' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="m-tour-panel m-tour-panel-aktiv" role="tabpanel">
          <div className="m-tour-text">
            <h3>{panel.title}</h3>
            <p>{panel.body}</p>
            <ul>
              {panel.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
          <div className="m-tour-mock" aria-hidden="true">
            <Mock />
          </div>
        </div>
      </div>
    </section>
  );
}
