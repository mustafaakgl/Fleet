import { Injectable } from '@nestjs/common';
import deNotifications from './de/notifications.json';
import enNotifications from './en/notifications.json';
import trNotifications from './tr/notifications.json';
import type { DriverNotifyKey } from '../notifications/driver-notify.copy';

type NotifyTemplate = Record<string, string>;

const DEFAULT_LANG = 'de';

const SUPPORTED = ['de', 'en', 'tr', 'pl', 'ro', 'bg', 'ar', 'uk', 'fr', 'it', 'es', 'nl', 'ru'] as const;

const BUNDLES: Record<string, Record<DriverNotifyKey, NotifyTemplate>> = {
  de: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  en: enNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  tr: trNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  pl: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  ro: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  bg: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  ar: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  uk: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  fr: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  it: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  es: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  nl: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
  ru: deNotifications as Record<DriverNotifyKey, NotifyTemplate>,
};

function interpolate(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function pickMessage(key: DriverNotifyKey, bucket: NotifyTemplate, params: Record<string, string>): string {
  switch (key) {
    case 'checkin_added_to_einsatzplan':
      return params.company
        ? interpolate(bucket.message_with_company ?? bucket.message, params)
        : bucket.message;
    case 'messenger_message':
      return params.preview
        ? interpolate(bucket.message_with_preview ?? bucket.message, params)
        : bucket.message;
    case 'transport_rejected':
      return params.reason
        ? interpolate(bucket.message_with_reason ?? bucket.message, params)
        : bucket.message;
    case 'license_check_rejected':
      return params.reason
        ? interpolate(bucket.message_with_reason ?? bucket.message, params)
        : bucket.message;
    case 'fine_assigned': {
      const plate = params.plate || bucket.default_plate || '';
      return interpolate(bucket.message, { ...params, plate });
    }
    default:
      return interpolate(bucket.message, params);
  }
}

@Injectable()
export class NotificationI18nService {
  resolve(
    language: string | null | undefined,
    key: DriverNotifyKey,
    params: Record<string, string> = {},
  ): { title: string; message: string } {
    const lang = language?.trim().toLowerCase();
    const resolvedLang =
      lang && (SUPPORTED as readonly string[]).includes(lang) ? lang : DEFAULT_LANG;
    const bucket =
      BUNDLES[resolvedLang]?.[key] ?? BUNDLES[DEFAULT_LANG][key];
    return {
      title: bucket.title,
      message: pickMessage(key, bucket, params),
    };
  }
}
