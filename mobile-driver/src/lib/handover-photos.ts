import type { HandoverPhotoSlot } from '@/api/types';

/** Keep in sync with backend HANDOVER_PHOTO_SLOTS. */
export const HANDOVER_PHOTO_SLOTS: HandoverPhotoSlot[] = [
  'front',
  'right',
  'left',
  'rear',
  'tail_lift',
  'interior',
];

export function resolveHandoverSlots(required?: HandoverPhotoSlot[]): HandoverPhotoSlot[] {
  return required?.length ? required : HANDOVER_PHOTO_SLOTS;
}
