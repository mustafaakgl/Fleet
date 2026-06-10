import type { AssignmentWritePayload } from '@/lib/types';
import { assignmentsApi, licenseChecksApi } from '@/lib/api';

export const LICENSE_COMPLIANCE_WARNING_CODE = 'LICENSE_COMPLIANCE_WARNING';

export function parseLicenseComplianceError(err: unknown): boolean {
  const responseData = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
  const payload =
    responseData?.message && typeof responseData.message === 'object'
      ? (responseData.message as { code?: string })
      : (responseData as { code?: string } | undefined);
  return payload?.code === LICENSE_COMPLIANCE_WARNING_CODE;
}

export async function shouldWarnLicenseCompliance(driverId: string): Promise<boolean> {
  try {
    const compliance = await licenseChecksApi.driverCompliance(driverId);
    return compliance.blocks_assignment;
  } catch {
    return false;
  }
}

export async function createAssignmentWithLicenseAck(
  payload: AssignmentWritePayload,
  acknowledge = false,
): Promise<void> {
  await assignmentsApi.create({
    ...payload,
    acknowledge_license_compliance_warning: acknowledge || undefined,
  });
}
