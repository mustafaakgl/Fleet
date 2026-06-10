import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { driverApi } from '@/api/endpoints';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing } from '@/theme';

type PickedPhoto = { uri: string; name: string; type: string };

export default function DefectReportScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['departure-check-status'],
    queryFn: () => driverApi.departureCheckStatus(),
  });

  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<'gering' | 'mittel' | 'kritisch'>('mittel');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const vehicleId = status?.assignment?.vehicle_id ?? '';

  const reportMutation = useMutation({
    mutationFn: () => {
      if (!vehicleId) throw new Error('No vehicle');
      if (!description.trim()) throw new Error('Description required');
      if (!photos.length) throw new Error('Photo required');
      return driverApi.reportDefect({
        vehicle_id: vehicleId,
        description: description.trim(),
        title: title.trim() || undefined,
        severity,
        photos,
      });
    },
    onSuccess: async () => {
      showSuccess(t('defects.reportSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['driver-defects'] });
      router.back();
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('defects.reportFailed')));
    },
  });

  async function addPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showError(t('defects.cameraDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotos((prev) => [
      ...prev,
      {
        uri: asset.uri,
        name: asset.fileName ?? `defect-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: t('defects.reportTitle') }} />
      <ScreenLayout title={t('defects.reportTitle')} subtitle={status?.assignment?.vehicle_plate ?? ''}>
        {!vehicleId ? (
          <Text style={styles.hint}>{t('defects.noVehicle')}</Text>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={t('defects.fieldTitle')}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('defects.fieldDescription')}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <View style={styles.severityRow}>
              {(['gering', 'mittel', 'kritisch'] as const).map((value) => (
                <ActionButton
                  key={value}
                  label={t(`defects.severity.${value}`)}
                  onPress={() => setSeverity(value)}
                  variant={severity === value ? 'primary' : 'secondary'}
                />
              ))}
            </View>
            <ActionButton label={t('defects.addPhoto')} onPress={() => void addPhoto()} />
            {photos.map((photo, index) => (
              <Image key={`${photo.uri}-${index}`} source={{ uri: photo.uri }} style={styles.thumb} />
            ))}
            <ActionButton
              label={reportMutation.isPending ? t('defects.reporting') : t('defects.submitReport')}
              onPress={() => reportMutation.mutate()}
              disabled={reportMutation.isPending || !description.trim() || !photos.length}
              variant="primary"
            />
          </View>
        )}
      </ScreenLayout>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  form: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  severityRow: { gap: spacing.xs },
  thumb: { width: '100%', height: 140, borderRadius: radius.sm },
});
