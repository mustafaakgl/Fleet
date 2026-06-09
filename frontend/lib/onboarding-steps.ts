export const ONBOARDING_WIDGET_STEP_IDS = [
  'tenant_profile',
  'invite_team',
  'drivers',
  'vehicles',
  'companies',
  'first_assignment',
] as const;

export type OnboardingWidgetStepId = (typeof ONBOARDING_WIDGET_STEP_IDS)[number];

export const ONBOARDING_WIDGET_LABEL_KEYS: Record<OnboardingWidgetStepId, string> = {
  tenant_profile: 'onboardingWidget.tasks.tenant',
  invite_team: 'onboardingWidget.tasks.users',
  drivers: 'onboardingWidget.tasks.drivers',
  vehicles: 'onboardingWidget.tasks.vehicles',
  companies: 'onboardingWidget.tasks.companies',
  first_assignment: 'onboardingWidget.tasks.assignment',
};

export function isOnboardingWidgetStepId(id: string): id is OnboardingWidgetStepId {
  return (ONBOARDING_WIDGET_STEP_IDS as readonly string[]).includes(id);
}
