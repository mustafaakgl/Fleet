import { redirect } from 'next/navigation';

export default function AssignmentsDailyOverviewPage() {
  redirect('/assignments?panel=tagesplanung&view=daily-overview');
}
