import { useMemo, useRef, useState } from 'react';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { ActionButton } from '@/components/ActionButton';
import { driverApi } from '@/api/endpoints';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { openAuthenticatedDocument, openAuthenticatedEquipmentIssuanceForm } from '@/lib/authenticated-files';

export default function EquipmentIssuanceScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const signatureRef = useRef<SignatureViewRef | null>(null);
  const params = useLocalSearchParams<{ id?: string }>();
  const issuanceId = typeof params.id === 'string' ? params.id : undefined;
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-equipment-issuance', issuanceId],
    enabled: Boolean(issuanceId),
    queryFn: () => driverApi.getEquipmentIssuance(issuanceId as string),
  });

  const signMutation = useMutation({
    mutationFn: () => driverApi.signEquipmentIssuance(issuanceId as string, signatureDataUrl as string),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['driver-equipment-issuance', issuanceId] });
      await queryClient.invalidateQueries({ queryKey: ['driver-equipment-issuances'] });
      await queryClient.invalidateQueries({ queryKey: ['driver-documents'] });
      showSuccess(t('equipmentIssuance.signSuccess'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('equipmentIssuance.signError')));
    },
  });

  const issuanceItems = useMemo(() => data?.items ?? [], [data?.items]);

  const openForm = async () => {
    if (!issuanceId) return;
    try {
      await openAuthenticatedEquipmentIssuanceForm(issuanceId);
    } catch (openError) {
      showError(getErrorMessage(openError, t('equipmentIssuance.formOpenError')));
    }
  };

  const openFinalDocument = async () => {
    if (!data?.finalDocument?.id) return;
    try {
      await openAuthenticatedDocument(data.finalDocument.id);
    } catch (openError) {
      showError(getErrorMessage(openError, t('equipmentIssuance.finalOpenError')));
    }
  };

  const submitSignature = () => {
    if (!signatureDataUrl) {
      Alert.alert(t('equipmentIssuance.signatureRequired'));
      return;
    }
    signMutation.mutate();
  };

  return (
    <ScreenLayout
      title={t('equipmentIssuance.title')}
      subtitle={t('equipmentIssuance.subtitle')}
    >
      {isLoading ? <LoadingState label={t('common.loading')} /> : null}
      {!isLoading && error ? (
        <ErrorState message={getErrorMessage(error, t('equipmentIssuance.loadError'))} onRetry={() => void refetch()} />
      ) : null}
      {!isLoading && !error && !data ? (
        <ErrorState message={t('equipmentIssuance.notFound')} onRetry={() => void refetch()} />
      ) : null}
      {data ? (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.meta}>{new Date(data.issuedAt).toLocaleString()}</Text>
            <Text style={styles.status}>{data.status.replaceAll('_', ' ')}</Text>
          </View>

          <ActionButton label={t('equipmentIssuance.openForm')} onPress={() => void openForm()} />

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('equipmentIssuance.items')}</Text>
            {issuanceItems.length === 0 ? (
              <Text style={styles.itemText}>-</Text>
            ) : (
              issuanceItems.map((item, index) => (
                <Text key={`${item.name}-${index}`} style={styles.itemText}>
                  {item.name} x{item.quantity}
                </Text>
              ))
            )}
          </View>

          {data.status === 'pending_signature' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('equipmentIssuance.signature')}</Text>
              <View style={styles.signatureWrap}>
                <SignatureScreen
                  ref={signatureRef}
                  onOK={(value) => setSignatureDataUrl(value)}
                  onEmpty={() => setSignatureDataUrl(null)}
                  descriptionText={t('equipmentIssuance.signatureHint')}
                  clearText={t('equipmentIssuance.clear')}
                  confirmText={t('equipmentIssuance.capture')}
                  webStyle={`.m-signature-pad--footer {display:flex; justify-content:space-between;} body,html {width:100%; height:100%;}`}
                />
              </View>
              <ActionButton
                label={t('equipmentIssuance.sign')}
                onPress={submitSignature}
                loading={signMutation.isPending}
                variant="primary"
              />
            </View>
          ) : null}

          {data.finalDocument?.id ? (
            <ActionButton label={t('equipmentIssuance.openFinal')} onPress={() => void openFinalDocument()} />
          ) : null}
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.text,
  },
  meta: {
    ...typography.caption,
    color: colors.muted,
  },
  status: {
    ...typography.label,
    color: colors.primary,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.text,
  },
  itemText: {
    ...typography.body,
    color: colors.text,
  },
  signatureWrap: {
    height: 260,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#fff',
  },
});