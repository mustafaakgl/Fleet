export type PushNotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};
