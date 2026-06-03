import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenLayout } from '@/components/ScreenLayout';
import { useTranslation } from '@/i18n/useTranslation';
import { driverApi } from '@/api/endpoints';
import type { RequestType } from '@/domain/models';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { RequestTypeCard } from '@/components/RequestTypeCard';
import { ActionButton } from '@/components/ActionButton';
import { colors } from '@/theme/colors';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

const REQUEST_TYPES: RequestType[] = [
  'vacation',
  'sick_leave',
  'training',
  'business_trip',
  'doctor_appointment',
  'special_leave',
  'overtime_compensation',
  'free_day',
  'other',
];

function formatShortDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  return parsed.toLocaleDateString();
}

export default function RequestsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [type, setType] = useState<RequestType>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [cargoOwner, setCargoOwner] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [routeDate, setRouteDate] = useState('');
  const [routeStartTime, setRouteStartTime] = useState('');
  const [routeEndTime, setRouteEndTime] = useState('');

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['driver-requests'],
    queryFn: () => driverApi.listRequests(),
  });

  const { data: transportRequests } = useQuery({
    queryKey: ['driver-transport-requests'],
    queryFn: () => driverApi.listTransportRequests(),
  });

  const { data: formOptions } = useQuery({
    queryKey: ['transport-form-options'],
    queryFn: () => driverApi.getTransportFormOptions(),
  });

  const mutation = useMutation({
    mutationFn: () => driverApi.createRequest({ type, startDate, endDate, reason }),
    onSuccess: () => {
      setStartDate('');
      setEndDate('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['driver-requests'] });
      showSuccess(t('requests.submitted'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('common.error')));
    },
  });

  const routeMutation = useMutation({
    mutationFn: () =>
      driverApi.createTransportRequest({
        vehicleId,
        companyId,
        cargoName,
        cargoOwner,
        pickupAddress,
        deliveryAddress,
        requestedDate: routeDate,
        startTime: routeStartTime,
        endTime: routeEndTime,
      }),
    onSuccess: () => {
      setCargoName('');
      setCargoOwner('');
      setPickupAddress('');
      setDeliveryAddress('');
      setRouteDate('');
      setRouteStartTime('');
      setRouteEndTime('');
      void queryClient.invalidateQueries({ queryKey: ['driver-transport-requests'] });
      showSuccess(t('requests.routeSubmitted'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('common.error')));
    },
  });

  const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

  const statusLabel = (status: string, ns: 'status' | 'transportStatus') => {
    const key = `requests.${ns}.${status}`;
    const translated = t(key);
    return translated === key ? status.replaceAll('_', ' ') : translated;
  };

  const onSubmit = () => {
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      setValidationError(t('requests.validationDate'));
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setValidationError(t('requests.validationRange'));
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  const onSubmitRoute = () => {
    if (!vehicleId || !companyId || !cargoName || !cargoOwner || !pickupAddress || !deliveryAddress) {
      setValidationError(t('requests.validationRoute'));
      return;
    }
    if (!isValidDate(routeDate) || !isValidTime(routeStartTime) || !isValidTime(routeEndTime)) {
      setValidationError(t('requests.validationRoute'));
      return;
    }
    setValidationError(null);
    routeMutation.mutate();
  };

  const applyAssignmentPreset = (assignmentId: string) => {
    const preset = formOptions?.assignments.find((item) => item.id === assignmentId);
    if (!preset) {
      return;
    }
    setVehicleId(preset.vehicleId);
    setCompanyId(preset.companyId);
    setRouteDate(preset.workDate);
    setRouteStartTime(preset.startTime);
    setRouteEndTime(preset.endTime);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('requests.title') }} />
      <ScreenLayout
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ['driver-transport-requests'] });
          void queryClient.invalidateQueries({ queryKey: ['transport-form-options'] });
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {REQUEST_TYPES.map((item) => (
            <RequestTypeCard
              key={item}
              label={t(`requests.types.${item}`)}
              selected={type === item}
              onPress={() => setType(item)}
            />
          ))}
        </ScrollView>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t('requests.newRequest')}</Text>
          <TextInput style={styles.input} placeholder={t('requests.startDate')} value={startDate} onChangeText={setStartDate} />
          <TextInput style={styles.input} placeholder={t('requests.endDate')} value={endDate} onChangeText={setEndDate} />
          <TextInput style={styles.input} placeholder={t('requests.reason')} value={reason} onChangeText={setReason} />
          <ActionButton
            label={mutation.isPending ? t('requests.submitting') : t('requests.submit')}
            onPress={onSubmit}
            disabled={mutation.isPending}
            variant="primary"
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t('requests.transportTitle')}</Text>
          {formOptions?.assignments.length ? (
            <View style={styles.presetRow}>
              {formOptions.assignments.map((assignment) => (
                <Pressable
                  key={assignment.id}
                  style={styles.presetChip}
                  onPress={() => applyAssignmentPreset(assignment.id)}
                >
                  <Text style={styles.presetText}>
                    {assignment.vehiclePlate} · {assignment.companyName}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>{t('requests.noOptions')}</Text>
          )}

          <Text style={styles.label}>{t('requests.selectVehicle')}</Text>
          <View style={styles.chipRow}>
            {(formOptions?.vehicles ?? []).map((vehicle) => (
              <Pressable
                key={vehicle.id}
                style={[styles.chip, vehicleId === vehicle.id && styles.chipSelected]}
                onPress={() => setVehicleId(vehicle.id)}
              >
                <Text style={[styles.chipText, vehicleId === vehicle.id && styles.chipTextSelected]}>
                  {vehicle.plateNumber}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t('requests.selectCompany')}</Text>
          <View style={styles.chipRow}>
            {(formOptions?.companies ?? []).map((company) => (
              <Pressable
                key={company.id}
                style={[styles.chip, companyId === company.id && styles.chipSelected]}
                onPress={() => setCompanyId(company.id)}
              >
                <Text style={[styles.chipText, companyId === company.id && styles.chipTextSelected]}>
                  {company.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput style={styles.input} placeholder={t('requests.cargoName')} value={cargoName} onChangeText={setCargoName} />
          <TextInput style={styles.input} placeholder={t('requests.cargoOwner')} value={cargoOwner} onChangeText={setCargoOwner} />
          <TextInput style={styles.input} placeholder={t('requests.pickup')} value={pickupAddress} onChangeText={setPickupAddress} />
          <TextInput
            style={styles.input}
            placeholder={t('requests.delivery')}
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
          />
          <TextInput style={styles.input} placeholder={t('requests.routeDate')} value={routeDate} onChangeText={setRouteDate} />
          <TextInput style={styles.input} placeholder={t('requests.routeStart')} value={routeStartTime} onChangeText={setRouteStartTime} />
          <TextInput style={styles.input} placeholder={t('requests.routeEnd')} value={routeEndTime} onChangeText={setRouteEndTime} />
          <ActionButton
            label={routeMutation.isPending ? t('requests.submitting') : t('requests.submitRoute')}
            onPress={onSubmitRoute}
            disabled={routeMutation.isPending}
            variant="primary"
          />
        </View>

        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}

        {isLoading ? <LoadingState label={t('common.loading')} /> : null}
        {!isLoading && error ? (
          <ErrorState
            message={getErrorMessage(error, t('requests.loadError'))}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : null}

        {!isLoading && !error && data?.length ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{t('requests.previous')}</Text>
            {data.map((item) => (
              <View key={item.id} style={styles.requestRow}>
                <Text style={styles.requestTitle}>{t(`requests.types.${item.type}`)}</Text>
                <Text style={styles.requestMeta}>
                  {formatShortDate(item.startDate)} → {formatShortDate(item.endDate)}
                </Text>
                <Text style={styles.requestMeta}>{statusLabel(item.status, 'status')}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {transportRequests?.length ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{t('requests.transportHistory')}</Text>
            {transportRequests.map((item) => (
              <View key={item.id} style={styles.requestRow}>
                <Text style={styles.requestTitle}>
                  {item.vehicle?.plateNumber ?? item.vehicleId} · {item.company?.name ?? item.companyId}
                </Text>
                <Text style={styles.requestMeta}>
                  {formatShortDate(item.requestedDate)} {item.startTime}–{item.endTime}
                </Text>
                <Text style={styles.requestMeta}>{statusLabel(item.status, 'transportStatus')}</Text>
                {item.conflictReason ? <Text style={styles.requestMeta}>{item.conflictReason}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScreenLayout>
    </>
  );
}

const styles = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  formCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  formTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
  },
  presetRow: { gap: 6 },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  presetText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: '#EFF6FF',
  },
  chipText: { color: colors.subtext, fontSize: 13 },
  chipTextSelected: { color: colors.accent, fontWeight: '700' },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  requestRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    gap: 2,
  },
  requestTitle: {
    color: colors.primary,
    fontWeight: '700',
  },
  requestMeta: {
    color: colors.subtext,
    fontSize: 13,
  },
});
