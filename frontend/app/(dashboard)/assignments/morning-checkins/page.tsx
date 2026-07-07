import { redirect } from 'next/navigation';

export default function AssignmentsMorningCheckinsPage() {
  redirect('/assignments?panel=tagesplanung&view=morning-checkins');
}
