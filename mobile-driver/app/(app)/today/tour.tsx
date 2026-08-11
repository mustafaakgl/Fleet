import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenLayout } from '@/components/ScreenLayout';
import { Card } from '@/components/ui/Card';
import { ActionButton } from '@/components/ActionButton';
import { SkeletonCard } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { driverApi } from '@/api/endpoints';
import { localTodayDate } from '@/lib/calendar-date';
import {
  MAX_WAYPOINTS_IN_LINK,
  buildFullTourUrl,
  buildNavigationUrl,
  type MobilePlatform,
  type NavigationApp,
} from '@/lib/navigation-links';
import {
  availableNavigationApps,
  fullRouteOpensGoogle,
} from '@/lib/navigation-preference';
import {
  loadNavigationApp,
  saveNavigationApp,
} from '@/lib/navigation-preference.storage';
import { TourRouteMap } from '@/components/TourRouteMap';
import {
  activeStopId,
  completedStopCount,
  newClientEventId,
  nextStopAction,
} from '@/lib/tour-stop-actions';
import { openExternalUrl } from '@/lib/maps';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import type { DriverTourStop } from '@/api/types';

function currentPlatform(): MobilePlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/** Varis saatini surucunun yerel saatinde gosterir; tarih gereksiz, gun zaten bugun. */
function arrivalTime(stop: DriverTourStop): string | null {
  if (!stop.plannedArrivalAt) return null;
  const parsed = new Date(stop.plannedArrivalAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function stopLabel(stop: DriverTourStop): string {
  return [stop.street, [stop.postalCode, stop.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
    .trim() || stop.address;
}

export default function TourScreen() {
  const { t } = useTranslation();
  const platform = currentPlatform();
  const [navApp, setNavApp] = useState<NavigationApp>('default');

  useEffect(() => {
    void loadNavigationApp().then(setNavApp);
  }, []);

  function chooseNavApp(app: NavigationApp) {
    setNavApp(app);
    void saveNavigationApp(app);
  }

  const queryClient = useQueryClient();

  /**
   * Isaretleme sonrasi turu sunucudan yeniden okuyoruz.
   *
   * Iyimser guncelleme YAPILMIYOR: sunucu gecisi reddedebiliyor (durum
   * gerilemesi, tekrarlanan olay) ve ekranda "tamamlandi" gorunup sunucuda
   * oyle olmamasi, surucunun bir duragi atladigini fark etmemesi demek.
   */
  const markMutation = useMutation({
    mutationFn: ({ stopId, status }: { stopId: string; status: 'arrived' | 'completed' }) => {
      const at = Date.now();
      return driverApi.markTourStop(stopId, {
        status,
        client_event_id: newClientEventId(stopId, status, at),
        occurred_at: new Date(at).toISOString(),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver-tour'] }),
  });

  const resetMutation = useMutation({
    mutationFn: (stopId: string) => driverApi.resetTourStop(stopId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver-tour'] }),
  });

  const busy = markMutation.isPending || resetMutation.isPending;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-tour', localTodayDate()],
    queryFn: () => driverApi.todayTour(localTodayDate()),
    retry: false,
  });

  const tour = data?.tour ?? null;

  /**
   * Turun tamamini harita uygulamasinda acar.
   *
   * Baglanti uretilemezse (Google Maps ~9 ara nokta aliyor) dugme hic
   * gosterilmez — eksik bir rota acmaktansa surucuyu durak durak
   * ilerletmek dogru.
   */
  async function openFullTour(stops: DriverTourStop[]) {
    const url = buildFullTourUrl(
      stops
        .filter((stop) => stop.latitude !== null && stop.longitude !== null)
        .map((stop) => ({
          latitude: stop.latitude as number,
          longitude: stop.longitude as number,
          label: stopLabel(stop),
        })),
    );
    if (url) {
      await openExternalUrl(url);
    }
  }

  async function navigateTo(stop: DriverTourStop) {
    if (stop.latitude === null || stop.longitude === null) return;
    const url = buildNavigationUrl(
      { latitude: stop.latitude, longitude: stop.longitude, label: stopLabel(stop) },
      platform,
      navApp,
    );
    if (url) {
      await openExternalUrl(url);
    }
  }

  return (
    <ScreenLayout title={t('tour.title')}>
      <Stack.Screen options={{ title: t('tour.title') }} />

      {isLoading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={getErrorMessage(error, t('common.error'))} onRetry={refetch} />
      ) : !tour ? (
        <Card>
          <Text style={styles.emptyText}>{t('tour.empty')}</Text>
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.headerRow}>
              <Text style={styles.tourName}>{tour.name ?? t('tour.title')}</Text>
              <StatusBadge label={t(`tour.status.${tour.status}`)} tone="neutral" />
            </View>
            <Text style={styles.summary}>
              {t('tour.summary', {
                stops: tour.stops.length,
                km: tour.plannedDistanceKm?.toFixed(0) ?? '–',
                minutes: tour.plannedDurationMin ?? '–',
              })}
            </Text>
            <Text style={styles.progress}>
              {t('tour.progress', {
                done: completedStopCount(tour.stops),
                total: tour.stops.length,
              })}
            </Text>
          </Card>

          <TourRouteMap stops={tour.stops} />

          <View style={styles.appPicker}>
            <Text style={styles.appPickerLabel}>{t('tour.navigationApp')}</Text>
            <View style={styles.appPickerRow}>
              {availableNavigationApps(platform).map((app) => (
                <Pressable
                  key={app}
                  onPress={() => chooseNavApp(app)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: navApp === app }}
                  style={[styles.appChip, navApp === app && styles.appChipActive]}
                >
                  <Text style={[styles.appChipText, navApp === app && styles.appChipTextActive]}>
                    {t(`tour.navApp.${app}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {tour.stops.filter((stop) => stop.latitude !== null).length <=
          MAX_WAYPOINTS_IN_LINK + 1 ? (
            <>
              <ActionButton
                label={t('tour.openFullRoute')}
                onPress={() => void openFullTour(tour.stops)}
              />
              {/* Sessizce baska uygulama acmak guven kaybettirir; soyleniyor. */}
              {fullRouteOpensGoogle(navApp, platform) ? (
                <Text style={styles.notice}>{t('tour.fullRouteGoogleOnly')}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.notice}>{t('tour.tooManyStopsForLink')}</Text>
          )}

          {tour.stops.map((stop) => {
            const navigable = stop.latitude !== null && stop.longitude !== null;
            const action = nextStopAction(stop.status);
            const isActive = activeStopId(tour.stops) === stop.id;
            return (
              <Card
                key={stop.id}
                style={StyleSheet.flatten([
                  styles.stopCard,
                  isActive ? styles.stopCardActive : null,
                  stop.status === 'completed' ? styles.stopCardDone : null,
                ])}
              >
                <View style={styles.headerRow}>
                  <Text style={styles.sequence}>{stop.sequence}</Text>
                  <Text style={styles.kind}>{t(`tour.kind.${stop.kind}`)}</Text>
                </View>

                <Text style={styles.address}>{stopLabel(stop)}</Text>

                {stop.windowStart && stop.windowEnd ? (
                  <Text style={styles.meta}>
                    {t('tour.window', { from: stop.windowStart, to: stop.windowEnd })}
                  </Text>
                ) : null}

                {(() => {
                  const eta = arrivalTime(stop);
                  return (
                    <Text style={styles.eta}>
                      {eta ? t('tour.eta', { time: eta }) : t('tour.etaUnknown')}
                    </Text>
                  );
                })()}

                {stop.legDistanceKm !== null ? (
                  <Text style={styles.meta}>
                    {t('tour.legDistance', { km: stop.legDistanceKm.toFixed(1) })}
                  </Text>
                ) : null}

                {/* Kamyon erisimi dogrulanmamis duraklarda surucu uyarilir.
                    Navigasyon yine de acilir — uyari engel degil, bilgi. */}
                {stop.truckAccess === 'unreachable' ? (
                  <Text style={styles.warning}>{t('tour.truckWarning.unreachable')}</Text>
                ) : stop.truckAccess !== 'reachable' ? (
                  <Text style={styles.notice}>{t('tour.truckWarning.unverified')}</Text>
                ) : null}

                <ActionButton
                  label={t('tour.navigate')}
                  onPress={() => void navigateTo(stop)}
                  disabled={!navigable}
                />

                {action.kind === 'mark' ? (
                  <ActionButton
                    label={t(action.labelKey)}
                    onPress={() =>
                      markMutation.mutate({ stopId: stop.id, status: action.next })
                    }
                    disabled={busy}
                  />
                ) : action.kind === 'reset' ? (
                  <ActionButton
                    label={t(action.labelKey)}
                    onPress={() => resetMutation.mutate(stop.id)}
                    disabled={busy}
                  />
                ) : null}
                {!navigable ? <Text style={styles.notice}>{t('tour.noCoordinates')}</Text> : null}
              </Card>
            );
          })}
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  tourName: { ...typography.h3, color: colors.text, flexShrink: 1 },
  summary: { ...typography.body, color: colors.subtext },
  stopCard: { marginTop: spacing.sm },
  stopCardActive: { borderWidth: 2, borderColor: colors.primary },
  stopCardDone: { opacity: 0.6 },
  progress: { ...typography.caption, color: colors.subtext, marginTop: spacing.xs },
  sequence: { ...typography.h3, color: colors.primary },
  kind: { ...typography.caption, color: colors.subtext, textTransform: 'uppercase' },
  address: { ...typography.body, color: colors.text, marginBottom: spacing.xs },
  eta: { ...typography.body, color: colors.primary, marginBottom: spacing.xs },
  appPicker: { marginBottom: spacing.sm },
  appPickerLabel: { ...typography.caption, color: colors.subtext, marginBottom: spacing.xs },
  appPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  appChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  appChipText: { ...typography.caption, color: colors.text },
  appChipTextActive: { color: '#fff' },
  meta: { ...typography.caption, color: colors.subtext },
  warning: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  notice: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
  emptyText: { ...typography.body, color: colors.subtext },
});
