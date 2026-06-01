import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

export default function VehicleHandoverUploadScreen() {
  const params = useLocalSearchParams<{ assignmentId?: string; vehicleId?: string }>();
  const [vehicleId, setVehicleId] = useState(params.vehicleId ?? '');
  const [assignmentId, setAssignmentId] = useState(params.assignmentId ?? '');
  const [createdHandoverId, setCreatedHandoverId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => driverApi.createHandover({ vehicleId, assignmentId: assignmentId || undefined }),
    onSuccess: (handover) => {
      setCreatedHandoverId(handover.id);
      showSuccess('Handover created. You can now upload photo.');
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to create handover.'));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!createdHandoverId) {
        throw new Error('Create handover before uploading photo.');
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Media library permission is required.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) {
        throw new Error('Image selection canceled.');
      }

      const asset = result.assets[0];
      const fileName = asset.fileName ?? `handover-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      return driverApi.uploadHandoverPhoto(
        createdHandoverId,
        { uri: asset.uri, name: fileName, type: mimeType },
        setUploadProgress,
      );
    },
    onSuccess: () => {
      setUploadProgress(100);
      showSuccess('Handover photo uploaded successfully.');
    },
    onError: (mutationError) => {
      setUploadProgress(0);
      const message = getErrorMessage(mutationError, 'Photo upload failed.');
      if (!message.includes('canceled')) {
        showError(message);
      }
    },
  });

  const onCreate = () => {
    if (!vehicleId.trim()) {
      setValidationError('Vehicle ID is required.');
      return;
    }
    setValidationError(null);
    createMutation.mutate();
  };

  return (
    <ScreenLayout
      title="Vehicle Handover Photo Upload"
      subtitle="Create handover and upload damage/transfer photo"
    >
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Vehicle ID"
          value={vehicleId}
          onChangeText={(value) => setVehicleId(value)}
        />
        <TextInput
          style={styles.input}
          placeholder="Assignment ID (optional)"
          value={assignmentId}
          onChangeText={setAssignmentId}
        />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, createMutation.isPending && styles.buttonDisabled]}
          onPress={onCreate}
          disabled={createMutation.isPending}
        >
          <Text style={styles.buttonText}>{createMutation.isPending ? 'Creating...' : 'Create Handover'}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.secondaryButton,
            (!createdHandoverId || uploadMutation.isPending) && styles.buttonDisabled,
          ]}
          onPress={() => uploadMutation.mutate()}
          disabled={!createdHandoverId || uploadMutation.isPending}
        >
          <Text style={styles.secondaryButtonText}>
            {uploadMutation.isPending ? `Uploading ${uploadProgress}%` : 'Pick Image and Upload'}
          </Text>
        </Pressable>
      </View>
      <Text>
        {createdHandoverId
          ? `Handover created: ${createdHandoverId}`
          : 'Create a handover first, then attach a photo from gallery/camera.'}
      </Text>
      <Text style={styles.hint}>Upload endpoint currently supports image files.</Text>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#2563EB',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  hint: {
    color: '#4B5563',
    fontSize: 12,
  },
});
