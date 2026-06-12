'use client';

import { useParams } from 'next/navigation';
import { ContactFormPage } from '@/components/settings/contacts/ContactFormPage';

export default function EditContactPage() {
  const params = useParams<{ id: string }>();
  return <ContactFormPage userId={params.id} />;
}
