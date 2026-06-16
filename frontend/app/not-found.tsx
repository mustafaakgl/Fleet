import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4">
      <p className="text-7xl font-bold text-gray-200">404</p>
      <h1 className="text-2xl font-bold text-gray-900 mt-4">Seite nicht gefunden</h1>
      <p className="text-gray-500 mt-2">Die gesuchte Seite ist nicht vorhanden.</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        Zum Dashboard
      </Link>
    </div>
  );
}
