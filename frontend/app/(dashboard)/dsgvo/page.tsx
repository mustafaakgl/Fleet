'use client';

import { Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DsgvoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-sky-600" />
        <h1 className="text-2xl font-bold text-gray-900">DSGVO</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Protection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">DSGVO ve veri koruma ayarlari burada yer alacak.</p>
        </CardContent>
      </Card>
    </div>
  );
}
