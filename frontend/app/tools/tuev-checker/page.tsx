import type { Metadata } from 'next';
import { TuevUvvCheckerSection } from '@/components/landing/TuevUvvCheckerSection';
import { ToolPageLayout } from '@/components/landing/marketing/ToolPageLayout';

export const metadata: Metadata = {
  title: 'TÜV & UVV Frist-Checker — kostenlos für Ihre Flotte — MyFleet',
  description:
    'Prüfen Sie HU-, SP- und UVV-Fristen Ihrer Fahrzeuge sofort — ohne Konto. Kostenloses Werkzeug für Speditionsflotten.',
};

export default function TuevCheckerPage() {
  return (
    <ToolPageLayout>
      <TuevUvvCheckerSection leadSource="tuev-checker" />
    </ToolPageLayout>
  );
}
