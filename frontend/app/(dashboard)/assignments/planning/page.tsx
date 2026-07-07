import { redirect } from 'next/navigation';

export default function AssignmentsPlanningPage() {
  redirect('/assignments?panel=tagesplanung&view=planning');
}
