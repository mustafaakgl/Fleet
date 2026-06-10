import Link from 'next/link';
import { companyName, LOGIN_HREF } from './marketing-config';

export function MarketingFooter() {
  const firm = companyName();

  return (
    <footer className="m-footer">
      <div className="m-wrap m-foot">
        <div>
          © {new Date().getFullYear()} {firm} GmbH
        </div>
        <div>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <a href="mailto:vertrieb@myfleet.de">AVV</a>
          <Link href={LOGIN_HREF}>Anmelden</Link>
          <Link href="/tools/bussgeld-rechner">Bußgeld-Rechner</Link>
          <Link href="/tools/fahrtenbuch">Fahrtenbuch-Rechner</Link>
          <Link href="/tools/tuev-checker">TÜV-Checker</Link>
        </div>
      </div>
    </footer>
  );
}
