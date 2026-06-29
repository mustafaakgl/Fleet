'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface DriverPageBackProps {
  href?: string;
  label: string;
}

export function DriverPageBack({ href = '/driver', label }: DriverPageBackProps) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
