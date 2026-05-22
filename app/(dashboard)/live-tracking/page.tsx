'use client';

import { MapPinned } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LiveTrackingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MapPinned className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">Live Tracking</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracking Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Canli arac takibi burada yer alacak.</p>
        </CardContent>
      </Card>
    </div>
  );
}
