import { redirect } from 'next/navigation';

export default function AssignmentsRevenueSummaryPage() {
  redirect('/assignments?panel=revenue');
}
