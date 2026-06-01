import { FlottenmonitorPage } from '@/components/flottenmonitor/FlottenmonitorPage';

type FlottenmonitorRouteProps = {
  searchParams?: Promise<{ tab?: string | string[] }>;
};

export default async function FlottenmonitorRoute({
  searchParams,
}: FlottenmonitorRouteProps) {
  const params = await searchParams;
  const tab = Array.isArray(params?.tab) ? params.tab[0] : params?.tab;

  return <FlottenmonitorPage initialTab={tab} />;
}
