import type { Metadata } from 'next';
import { FahrtenbuchSteuerrechnerSection } from '@/components/landing/FahrtenbuchSteuerrechnerSection';
import { ToolPageLayout } from '@/components/landing/marketing/ToolPageLayout';

export const metadata: Metadata = {
  title: 'Fahrtenbuch-Steuerrechner — 1%-Regelung vs. Fahrtenbuch — MyFleet',
  description:
    'Vergleichen Sie 1%-Regelung und digitales Fahrtenbuch. Schätzen Sie Ihre Steuerersparnis pro Dienstwagen — kostenlos und unverbindlich.',
};

export default function FahrtenbuchRechnerPage() {
  return (
    <ToolPageLayout>
      <FahrtenbuchSteuerrechnerSection leadSource="fahrtenbuch" />
    </ToolPageLayout>
  );
}
