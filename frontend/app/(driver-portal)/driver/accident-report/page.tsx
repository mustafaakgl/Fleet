import { redirect } from 'next/navigation';

/** @deprecated Use /driver/reports — kept for old bookmarks and links. */
export default function DriverAccidentReportRedirect() {
  redirect('/driver/reports');
}
