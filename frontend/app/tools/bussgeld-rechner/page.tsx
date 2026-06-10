import type { Metadata } from 'next';
import { BussgeldRechnerSection } from '@/components/landing/BussgeldRechnerSection';
import { ToolPageLayout } from '@/components/landing/marketing/ToolPageLayout';

export const metadata: Metadata = {
  title: 'Bußgeld-Risikorechner für Ihre Flotte — MyFleet',
  description:
    'Berechnen Sie in 30 Sekunden das Bußgeld-Risiko Ihrer LKW-Flotte bei verpassten HU-, UVV- und Führerschein-Fristen. Kostenlos, unverbindlich.',
};

export default function BussgeldRechnerPage() {
  return (
    <ToolPageLayout>
      <BussgeldRechnerSection leadSource="bussgeld-rechner" />
    </ToolPageLayout>
  );
}
