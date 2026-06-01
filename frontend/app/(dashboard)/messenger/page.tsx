'use client';

import { MessageSquare, ShieldCheck, Truck, Wallet, TriangleAlert, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const bureauDepartments = [
  {
    id: 'fleet',
    label: 'Filo Bolumu',
    description: 'Arac atama, servis, ruhsat ve operasyon mesajlari',
    icon: Truck,
  },
  {
    id: 'payroll',
    label: 'Maas Bolumu',
    description: 'Maas bordrosu, odeme ve kontrat konusmalari',
    icon: Wallet,
  },
  {
    id: 'accident',
    label: 'Kaza Bolumu',
    description: 'Kaza bildirimi, tutanak ve sigorta surecleri',
    icon: TriangleAlert,
  },
];

const messageThreads = [
  {
    id: 'msg-001',
    driver: 'Ali Yilmaz',
    department: 'Filo Bolumu',
    topic: 'Arac teslim ve servis randevusu',
    lastMessage: 'Tire rotation icin arac 22 Mayis 09:00 servis girisi yapacak.',
    updatedAt: '10 min ago',
    status: 'open',
  },
  {
    id: 'msg-002',
    driver: 'Mehmet Demir',
    department: 'Maas Bolumu',
    topic: 'Nisan maas bordrosu',
    lastMessage: 'Bordro PDF sisteme yuklendi, onay bekleniyor.',
    updatedAt: '35 min ago',
    status: 'pending',
  },
  {
    id: 'msg-003',
    driver: 'Hasan Kaya',
    department: 'Kaza Bolumu',
    topic: 'Kaza evragi ve hasar bildirimi',
    lastMessage: 'Eksper raporu yarin sisteme eklenecek.',
    updatedAt: '2 h ago',
    status: 'critical',
  },
];

export default function MessengerPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Messenger</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Main Admin Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            Su an sistem ana admin (patron) uzerinden kurgulandi. Ana admin tum buro bolumleri ve tum driver mesajlarini gorebilir.
          </p>
          <p>
            Messenger akisinda mesajlasma sadece <span className="font-medium">Buro Personeli</span> ile <span className="font-medium">Driver</span> arasinda olur.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {bureauDepartments.map(({ id, label, description, icon: Icon }) => (
          <Card key={id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="w-4 h-4 text-blue-600" />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{description}</p>
              <p className="text-xs text-gray-400 mt-2">Ayrı giris yetkisi tanimlanabilir.</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Bureau-Driver Threads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {messageThreads.map((thread) => (
            <div
              key={thread.id}
              className="rounded-lg border border-gray-200 p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    <UserRound className="w-3 h-3" />
                    {thread.driver}
                  </span>
                  <span className="text-xs text-gray-500">{thread.department}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">{thread.topic}</p>
                <p className="mt-1 text-sm text-gray-600">{thread.lastMessage}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-gray-400">{thread.updatedAt}</p>
                <p
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    thread.status === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : thread.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {thread.status}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
