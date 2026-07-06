export const TACHOGRAPH_JOBS = ['tachograph.ddd.process'] as const;
export type TachographJobName = (typeof TACHOGRAPH_JOBS)[number];

export type DddProcessJobPayload = {
  tenantId: string;
  dddFileId: string;
};

export type TachographJobHandler = (payload: unknown) => Promise<void>;

export type TachographPermanentFailureHandler = (
  payload: unknown,
  error: unknown,
) => Promise<void>;
