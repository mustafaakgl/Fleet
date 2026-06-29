import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';

export interface NotificationSseEvent {
  type: 'new_notification' | 'unread_count';
  unreadCount: number;
  notification?: {
    id: string;
    title: string;
    message: string;
    type: string;
    priority: string;
    createdAt: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  };
}

@Injectable()
export class NotificationSseService implements OnModuleDestroy {
  private readonly clients = new Map<string, Set<Subject<MessageEvent>>>();

  subscribe(userId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(subject);

    return subject.asObservable().pipe(
      finalize(() => {
        const set = this.clients.get(userId);
        if (set) {
          set.delete(subject);
          if (set.size === 0) {
            this.clients.delete(userId);
          }
        }
      }),
    );
  }

  emit(userId: string, event: NotificationSseEvent): void {
    const subjects = this.clients.get(userId);
    if (!subjects || subjects.size === 0) return;

    const messageEvent = { data: event } as MessageEvent;
    for (const subject of subjects) {
      subject.next(messageEvent);
    }
  }

  onModuleDestroy() {
    for (const subjects of this.clients.values()) {
      for (const subject of subjects) {
        subject.complete();
      }
    }
    this.clients.clear();
  }
}
