import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  RequestAttachmentsPicker,
  type PickedAttachment,
} from '@/components/RequestAttachmentsPicker';
import { SectionHeader } from '@/components/SectionHeader';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/ui/Card';
import { driverApi } from '@/api/endpoints';
import type { TransportFormOptions } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

function formatVehicleLabel(vehicle: {
  plateNumber: string;
  brand?: string;
  model?: string;
}) {
  if (vehicle.brand && vehicle.model) {
    return `${vehicle.plateNumber} · ${vehicle.brand} ${vehicle.model}`;
  }
  return vehicle.plateNumber;
}

function assignmentForVehicle(
  vehicleId: string,
  assignments: TransportFormOptions['assignments'],
) {
  return assignments.find((item) => item.vehicleId === vehicleId)?.id;
}

async function uploadAttachments(
  accidentId: string,
  files: PickedAttachment[],
  documentType: string,
  uploadFailedMessage: string,
) {
  for (const file of files) {
    try {
      await driverApi.uploadAccidentAttachment(accidentId, file, documentType);
    } catch {
      throw new Error(uploadFailedMessage);
    }
  }
}

function VehicleSelector({
  label,
  vehicles,
  value,
  onChange,
  emptyMessage,
}: {
  label: string;
  vehicles: TransportFormOptions['vehicles'];
  value: string;
  onChange: (vehicleId: string) => void;
  emptyMessage: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {vehicles.length ? (
        <View style={styles.chipRow}>
          {vehicles.map((vehicle) => (
            <Pressable
              key={vehicle.id}
              style={[styles.chip, value === vehicle.id && styles.chipSelected]}
              onPress={() => onChange(vehicle.id)}
            >
              <Text style={[styles.chipText, value === vehicle.id && styles.chipTextSelected]}>
                {formatVehicleLabel(vehicle)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.noVehicles}>{emptyMessage}</Text>
      )}
    </View>
  );
}

export function DriverReportsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [accidentVehicleId, setAccidentVehicleId] = useState('');
  const [cargoVehicleId, setCargoVehicleId] = useState('');
  const [location, setLocation] = useState('');
  const [accidentDescription, setAccidentDescription] = useState('');
  const [accidentPhotos, setAccidentPhotos] = useState<PickedAttachment[]>([]);
  const [policeDocuments, setPoliceDocuments] = useState<PickedAttachment[]>([]);
  const [cargoOwner, setCargoOwner] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [cargoQuantity, setCargoQuantity] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [cargoPhotos, setCargoPhotos] = useState<PickedAttachment[]>([]);
  const [cargoDocuments, setCargoDocuments] = useState<PickedAttachment[]>([]);

  const { data: formOptions } = useQuery({
    queryKey: ['driver-transport-form-options'],
    queryFn: () => driverApi.getTransportFormOptions(),
  });

  useEffect(() => {
    const defaultVehicleId = formOptions?.vehicles[0]?.id ?? '';
    if (!defaultVehicleId) return;
    setAccidentVehicleId((current) => current || defaultVehicleId);
    setCargoVehicleId((current) => current || defaultVehicleId);
  }, [formOptions]);

  const accidentAssignmentId = useMemo(
    () =>
      accidentVehicleId && formOptions
        ? assignmentForVehicle(accidentVehicleId, formOptions.assignments)
        : undefined,
    [accidentVehicleId, formOptions],
  );

  const cargoAssignmentId = useMemo(
    () =>
      cargoVehicleId && formOptions
        ? assignmentForVehicle(cargoVehicleId, formOptions.assignments)
        : undefined,
    [cargoVehicleId, formOptions],
  );

  const accidentMutation = useMutation({
    mutationFn: async () => {
      if (!accidentVehicleId) {
        throw new Error(t('reports.validationVehicle'));
      }
      const created = await driverApi.createAccident({
        type: 'vehicle_accident',
        vehicleId: accidentVehicleId,
        assignmentId: accidentAssignmentId,
        incidentDateTime: new Date().toISOString(),
        description: accidentDescription.trim(),
        location: location.trim() || undefined,
      });
      await uploadAttachments(created.id, accidentPhotos, 'Scene Photo', t('requests.attachments.uploadFailed'));
      await uploadAttachments(created.id, policeDocuments, 'Police Report', t('requests.attachments.uploadFailed'));
      return created;
    },
    onSuccess: () => {
      setLocation('');
      setAccidentDescription('');
      setAccidentPhotos([]);
      setPoliceDocuments([]);
      void queryClient.invalidateQueries({ queryKey: ['driver-accidents', 'vehicle_accident'] });
      showSuccess(t('reports.accidentSuccess'));
    },
    onError: (error) => {
      showError(getErrorMessage(error, t('reports.accidentSubmitFailed')));
    },
  });

  const cargoMutation = useMutation({
    mutationFn: async () => {
      if (!cargoVehicleId) {
        throw new Error(t('reports.validationVehicle'));
      }
      const created = await driverApi.createAccident({
        type: 'cargo_damage',
        vehicleId: cargoVehicleId,
        assignmentId: cargoAssignmentId,
        incidentDateTime: new Date().toISOString(),
        description: cargoDescription.trim(),
        cargoOwner: cargoOwner.trim(),
        cargoName: cargoType.trim(),
        cargoQuantity: cargoQuantity.trim(),
      });
      await uploadAttachments(created.id, cargoPhotos, 'Damage Photo', t('requests.attachments.uploadFailed'));
      await uploadAttachments(
        created.id,
        cargoDocuments,
        'Cargo Owner Document',
        t('requests.attachments.uploadFailed'),
      );
      return created;
    },
    onSuccess: () => {
      setCargoOwner('');
      setCargoType('');
      setCargoQuantity('');
      setCargoDescription('');
      setCargoPhotos([]);
      setCargoDocuments([]);
      void queryClient.invalidateQueries({ queryKey: ['driver-accidents', 'cargo_damage'] });
      showSuccess(t('reports.cargoSuccess'));
    },
    onError: (error) => {
      showError(getErrorMessage(error, t('reports.cargoSubmitFailed')));
    },
  });

  const submitAccident = () => {
    if (!accidentVehicleId) {
      showError(t('reports.validationVehicle'));
      return;
    }
    if (!accidentDescription.trim()) {
      showError(t('reports.validationDescription'));
      return;
    }
    accidentMutation.mutate();
  };

  const submitCargo = () => {
    if (!cargoVehicleId) {
      showError(t('reports.validationVehicle'));
      return;
    }
    if (!cargoOwner.trim() || !cargoType.trim() || !cargoQuantity.trim()) {
      showError(t('reports.validationCargoFields'));
      return;
    }
    if (!cargoDescription.trim()) {
      showError(t('reports.validationDescription'));
      return;
    }
    cargoMutation.mutate();
  };

  const vehicles = formOptions?.vehicles ?? [];

  return (
    <View style={styles.stack}>
      <Card>
        <SectionHeader title={t('reports.accidentTitle')} />
        <Text style={styles.sectionHint}>{t('reports.accidentSubtitle')}</Text>
        <VehicleSelector
          label={t('requests.selectVehicle')}
          vehicles={vehicles}
          value={accidentVehicleId}
          onChange={setAccidentVehicleId}
          emptyMessage={t('reports.validationVehicle')}
        />
        <Field
          label={t('reports.location')}
          value={location}
          onChangeText={setLocation}
          placeholder={t('reports.location')}
        />
        <Field
          label={t('reports.description')}
          value={accidentDescription}
          onChangeText={setAccidentDescription}
          placeholder={t('reports.description')}
          multiline
        />
        <Text style={styles.uploadLabel}>{t('reports.accidentPhotos')}</Text>
        <Text style={styles.uploadHint}>{t('reports.accidentPhotosHint')}</Text>
        <RequestAttachmentsPicker files={accidentPhotos} onChange={setAccidentPhotos} maxFiles={6} />
        <Text style={styles.uploadLabel}>{t('reports.policeDocuments')}</Text>
        <Text style={styles.uploadHint}>{t('reports.policeDocumentsHint')}</Text>
        <RequestAttachmentsPicker files={policeDocuments} onChange={setPoliceDocuments} maxFiles={4} />
        <ActionButton
          label={accidentMutation.isPending ? t('reports.submittingAccident') : t('reports.submitAccident')}
          onPress={submitAccident}
          disabled={accidentMutation.isPending}
        />
      </Card>

      <Card>
        <SectionHeader title={t('reports.cargoTitle')} />
        <Text style={styles.sectionHint}>{t('reports.cargoSubtitle')}</Text>
        <VehicleSelector
          label={t('requests.selectVehicle')}
          vehicles={vehicles}
          value={cargoVehicleId}
          onChange={setCargoVehicleId}
          emptyMessage={t('reports.validationVehicle')}
        />
        <Field
          label={t('reports.cargoOwner')}
          value={cargoOwner}
          onChangeText={setCargoOwner}
          placeholder={t('reports.cargoOwner')}
        />
        <Field
          label={t('reports.cargoType')}
          value={cargoType}
          onChangeText={setCargoType}
          placeholder={t('reports.cargoType')}
        />
        <Field
          label={t('reports.cargoQuantity')}
          value={cargoQuantity}
          onChangeText={setCargoQuantity}
          placeholder={t('reports.cargoQuantityPlaceholder')}
        />
        <Field
          label={t('reports.description')}
          value={cargoDescription}
          onChangeText={setCargoDescription}
          placeholder={t('reports.description')}
          multiline
        />
        <Text style={styles.uploadLabel}>{t('reports.cargoPhotos')}</Text>
        <Text style={styles.uploadHint}>{t('reports.cargoPhotosHint')}</Text>
        <RequestAttachmentsPicker files={cargoPhotos} onChange={setCargoPhotos} maxFiles={6} />
        <Text style={styles.uploadLabel}>{t('reports.cargoDocuments')}</Text>
        <Text style={styles.uploadHint}>{t('reports.cargoDocumentsHint')}</Text>
        <RequestAttachmentsPicker files={cargoDocuments} onChange={setCargoDocuments} maxFiles={4} />
        <ActionButton
          label={cargoMutation.isPending ? t('reports.submittingCargo') : t('reports.submitCargo')}
          onPress={submitCargo}
          disabled={cargoMutation.isPending}
        />
      </Card>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  sectionHint: { ...typography.caption, textTransform: 'none', marginBottom: spacing.md, lineHeight: 18 },
  field: { gap: 6, marginBottom: spacing.sm },
  fieldLabel: { ...typography.caption, textTransform: 'none', color: colors.subtext },
  noVehicles: { ...typography.caption, textTransform: 'none', color: colors.subtext },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.primary,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: { ...typography.caption, textTransform: 'none', color: colors.primary },
  chipTextSelected: { color: colors.accent, fontWeight: '600' },
  uploadLabel: { ...typography.bodyMedium, color: colors.primary, marginTop: spacing.xs },
  uploadHint: { ...typography.caption, textTransform: 'none', marginBottom: spacing.xs, lineHeight: 16 },
});
