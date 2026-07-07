import { redirect } from 'next/navigation';

export default function AssignmentsVehicleHandoversPage() {
  redirect('/assignments?panel=tagesplanung&view=vehicle-handovers');
}
