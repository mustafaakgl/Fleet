import { whatsAppHref } from './marketing-config';

export function WhatsAppButton() {
  return (
    <a
      href={whatsAppHref()}
      target="_blank"
      rel="noopener noreferrer"
      className="m-wa-float"
      aria-label="WhatsApp Kontakt"
      data-track="whatsapp"
    >
      💬
    </a>
  );
}
