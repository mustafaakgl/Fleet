import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Fuhrpark-Software für Speditionen — Fristen, Dokumente, Fahrer',
  description:
    'Die Fuhrpark-Software für LKW-Flotten: Fristen, Dokumente und mehrsprachige Fahrer-Kommunikation. Ohne Hardware, monatlich kündbar.',
  openGraph: {
    title: 'Fuhrpark-Software für Speditionen — Fristen, Dokumente, Fahrer',
    description:
      'Die Fuhrpark-Software für LKW-Flotten: Fristen, Dokumente und mehrsprachige Fahrer-Kommunikation. Ohne Hardware, monatlich kündbar.',
    locale: 'de_DE',
    type: 'website',
  },
};

export default function RootPage() {
  return <LandingPage />;
}
