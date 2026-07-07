import { redirect } from 'next/navigation';

export default function AssignmentsCompanyNotificationsPage() {
  redirect('/assignments?panel=company_notifications&view=company-notifications');
}
