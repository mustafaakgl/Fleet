import { LiveTrackingPage } from '@/components/live-tracking/LiveTrackingPage';
import { ConnectionBannerProvider, ConnectionBannerSlot } from '@/components/connection/ConnectionBannerProvider';

export default function LiveTrackingPreviewPage() {
  return (
    <ConnectionBannerProvider>
      <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] space-y-4">
          <ConnectionBannerSlot />
          <LiveTrackingPage />
        </div>
      </div>
    </ConnectionBannerProvider>
  );
}