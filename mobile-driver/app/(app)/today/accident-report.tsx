import { Redirect } from 'expo-router';

/** @deprecated Use the Reports tab — kept for deep links from older builds. */
export default function AccidentReportRedirect() {
  return <Redirect href="/(app)/reports" />;
}
