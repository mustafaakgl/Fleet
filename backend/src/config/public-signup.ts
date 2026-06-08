export function isPublicSignupEnabled(): boolean {
  return (process.env.ALLOW_PUBLIC_SIGNUP ?? '').toLowerCase() === 'true';
}
