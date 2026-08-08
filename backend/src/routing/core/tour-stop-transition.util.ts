/**
 * Durak isaretlemenin saf karar kismi.
 *
 * Saf tutulmasinin sebebi cevrimdisi kuyruk: surucu sebeke yokken isaretliyor,
 * baglanti gelince olaylar TOPLU ve SIRASI BOZUK gelebiliyor. Yanlis karar
 * sahada "tamamladigim durak yeniden acildi" olarak ortaya cikar ve geriye
 * donuk teshisi zordur.
 */

export type TourStopExecutionStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

/** Ileri gidilir, geri donulmez. completed ve skipped esit: ikisi de bitmis. */
const RANK: Record<TourStopExecutionStatus, number> = {
  pending: 0,
  arrived: 1,
  completed: 2,
  skipped: 2,
};

export const TERMINAL_STOP_STATUSES: TourStopExecutionStatus[] = ['completed', 'skipped'];

export function isTerminalStopStatus(status: TourStopExecutionStatus): boolean {
  return TERMINAL_STOP_STATUSES.includes(status);
}

export interface StopTransitionCurrent {
  status: TourStopExecutionStatus;
  /** En son uygulanan istemci olayinin kimligi. */
  clientEventId: string | null;
}

export interface StopTransitionInput {
  status: TourStopExecutionStatus;
  clientEventId?: string | null;
}

export type StopTransitionDecision =
  | { apply: false; reason: 'duplicate_event' | 'status_regression' | 'not_markable' }
  | { apply: true; setsArrivedAt: boolean; setsCompletedAt: boolean };

export function decideStopTransition(
  current: StopTransitionCurrent,
  input: StopTransitionInput,
): StopTransitionDecision {
  // `pending` isaretleme degil geri almadir; ayri ucu var.
  if (input.status === 'pending') {
    return { apply: false, reason: 'not_markable' };
  }

  // Kuyruk ayni olayi tekrar gonderdi.
  if (input.clientEventId && current.clientEventId === input.clientEventId) {
    return { apply: false, reason: 'duplicate_event' };
  }

  // Sirasi bozuk gelen eski olay yeniyi ezmesin.
  if (RANK[input.status] < RANK[current.status]) {
    return { apply: false, reason: 'status_regression' };
  }

  return {
    apply: true,
    setsArrivedAt: input.status === 'arrived',
    setsCompletedAt: isTerminalStopStatus(input.status),
  };
}
