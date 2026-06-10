export function HeroMockup() {
  return (
    <div className="m-mockup" aria-hidden="true">
      <div className="m-browser">
        <div className="m-browser-bar">
          <span className="m-dot" />
          <span className="m-dot" />
          <span className="m-dot" />
        </div>
        <div className="m-screen">
          <div className="m-side">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="m-main">
            <div className="m-kpi-row">
              <div className="m-kpi">
                <b>68</b>
                <span>Fahrzeuge aktiv</span>
              </div>
              <div className="m-kpi m-kpi-warn">
                <b>3</b>
                <span>Fristen kritisch</span>
              </div>
              <div className="m-kpi">
                <b>124</b>
                <span>Dokumente neu</span>
              </div>
            </div>
            <div className="m-alertz">
              <div className="m-alert-z m-alert-z-rot">
                <span>
                  <b>M-KL 482</b> · HU überfällig
                </span>
                <span className="m-pill m-pill-r">Handeln</span>
              </div>
              <div className="m-alert-z">
                <span>
                  <b>M-TR 119</b> · UVV in 21 Tagen
                </span>
                <span className="m-pill m-pill-g">Geplant</span>
              </div>
              <div className="m-alert-z">
                <span>
                  <b>P. Kowalski</b> · Führerschein in 30 Tagen
                </span>
                <span className="m-pill m-pill-g">Erinnert</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="m-phone">
        <div className="m-ph-head">Fahrer-App</div>
        <div className="m-bubble m-bubble-in">
          Lieferschein fehlt für Tour 12
          <span className="m-lang">automatisch übersetzt · PL → DE</span>
        </div>
        <div className="m-bubble m-bubble-out">
          Foto erhalten, alles klar ✓
          <span className="m-lang">DE → PL</span>
        </div>
      </div>
    </div>
  );
}
