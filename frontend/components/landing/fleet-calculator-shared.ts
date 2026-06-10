import { IBM_Plex_Mono, Inter, Saira_Condensed } from 'next/font/google';

export const calculatorInter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-bussgeld-inter',
});

export const calculatorSaira = Saira_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-bussgeld-saira',
});

export const calculatorMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-bussgeld-mono',
});

export const calculatorFontClassName = `${calculatorInter.variable} ${calculatorSaira.variable} ${calculatorMono.variable}`;

export function formatEuro(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
}

export function sliderFill(value: number, min: number, max: number): string {
  const percent = ((value - min) / (max - min)) * 100;
  return `${percent}%`;
}

export function getSalesContactEmail(): string {
  return (
    process.env.NEXT_PUBLIC_SALES_CONTACT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ||
    'vertrieb@myfleet.de'
  );
}

export function submitLeadMailto(params: {
  email: string;
  subject: string;
  bodyLines: string[];
}): void {
  const subject = encodeURIComponent(params.subject);
  const body = encodeURIComponent([...params.bodyLines, '', `E-Mail: ${params.email.trim()}`].join('\n'));
  window.location.href = `mailto:${getSalesContactEmail()}?subject=${subject}&body=${body}`;
}

export async function submitLeadApi(params: {
  email: string;
  source: string;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email.trim(),
        source: params.source,
        ...params.payload,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
