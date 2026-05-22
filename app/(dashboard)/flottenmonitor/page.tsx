import { FlottenmonitorPage } from '@/components/flottenmonitor/FlottenmonitorPage';

export default function FlottenmonitorRoute({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  return <FlottenmonitorPage initialTab={searchParams?.tab} />;
}
