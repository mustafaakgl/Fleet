import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

function navigateFromPushData(data: Record<string, unknown> | undefined) {
  if (!data) {
    return;
  }

  const relatedType = typeof data.relatedEntityType === 'string' ? data.relatedEntityType : null;
  const relatedId = typeof data.relatedEntityId === 'string' ? data.relatedEntityId : null;

  if (relatedType === 'conversation' && relatedId) {
    router.push(`/(app)/messages/${relatedId}`);
    return;
  }
  if (relatedType === 'assignment' && relatedId) {
    router.push(`/(app)/today/assignment/${relatedId}`);
    return;
  }
  if (relatedType === 'morning_checkin') {
    router.push('/(app)/today');
    return;
  }
  if (relatedType === 'request' || relatedType === 'transport_request') {
    router.push('/(app)/requests');
    return;
  }
  if (relatedType === 'Fine' && relatedId) {
    router.push(`/(app)/today/fine/${relatedId}`);
    return;
  }

  if (relatedType === 'Defect' && relatedId) {
    router.push(`/(app)/today/defect/${relatedId}`);
    return;
  }
  if (relatedType === 'DepartureCheck' && relatedId) {
    router.push('/(app)/today/departure-check');
    return;
  }

  const pushType = typeof data.type === 'string' ? data.type : null;
  const fineId = typeof data.fineId === 'string' ? data.fineId : null;
  const defectId = typeof data.defectId === 'string' ? data.defectId : null;
  if (pushType === 'fine_assigned' && fineId) {
    router.push(`/(app)/today/fine/${fineId}`);
    return;
  }
  if (pushType === 'defect_confirm_due' && defectId) {
    router.push(`/(app)/today/defect/${defectId}`);
    return;
  }
  if (pushType === 'departure_check_reminder') {
    router.push('/(app)/today/departure-check');
    return;
  }

  router.push('/(app)/notifications');
}

const noopSubscription = { remove: () => undefined };

export function registerNotificationResponseHandler() {
  if (!isNative) {
    return noopSubscription;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    navigateFromPushData(data);
  });

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) {
        return;
      }
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      navigateFromPushData(data);
    })
    .catch(() => {
      // ignore cold-start races on simulators
    });

  return subscription;
}
