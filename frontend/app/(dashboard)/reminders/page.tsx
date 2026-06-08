'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RemindersIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reminders/service');
  }, [router]);

  return null;
}
