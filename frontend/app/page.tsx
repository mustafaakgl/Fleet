import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { faqItems } from '@/components/landing/marketing/marketing-config';

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

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function RootPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingPage />
    </>
  );
}
