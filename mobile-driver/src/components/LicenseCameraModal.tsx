import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { LicenseCardOverlay } from '@/components/LicenseCardOverlay';
import { validateLicensePhotoQuality, type PhotoQualityIssue } from '@/lib/license-photo-quality';
import { useTranslation } from '@/i18n/useTranslation';
import { showError } from '@/utils/feedback';
import { colors, radius, spacing } from '@/theme';

type LicenseCameraModalProps = {
  visible: boolean;
  mode: 'card' | 'selfie';
  onClose: () => void;
  onCaptured: (result: { uri: string; name: string; type: string }) => void;
};

function qualityMessage(t: (key: string, params?: Record<string, string>) => string, issue: PhotoQualityIssue) {
  if (issue === 'too_narrow') return t('licenseCheck.qualityTooNarrow');
  if (issue === 'too_dark') return t('licenseCheck.qualityTooDark');
  return t('licenseCheck.qualityTooBlurry');
}

export function LicenseCameraModal({ visible, mode, onClose, onCaptured }: LicenseCameraModalProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        showError(t('licenseCheck.captureFailed'));
        return;
      }

      const quality = await validateLicensePhotoQuality(photo.uri);
      if (!quality.ok) {
        showError(qualityMessage(t, quality.issue));
        return;
      }

      onCaptured({
        uri: photo.uri,
        name: `license-${mode}-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
      onClose();
    } catch {
      showError(t('licenseCheck.captureFailed'));
    } finally {
      setCapturing(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>{t('licenseCheck.cameraDenied')}</Text>
            <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
              <Text style={styles.permissionBtnText}>{t('licenseCheck.grantCamera')}</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView ref={cameraRef} style={styles.camera} facing={mode === 'selfie' ? 'front' : 'back'}>
            {mode === 'card' ? <LicenseCardOverlay /> : <SelfieOverlay />}
          </CameraView>
        )}

        <View style={styles.toolbar}>
          <Pressable style={styles.iconBtn} onPress={onClose} accessibilityLabel={t('common.cancel')}>
            <Feather name="x" size={22} color={colors.white} />
          </Pressable>

          <Pressable
            style={[styles.shutter, capturing && styles.shutterDisabled]}
            onPress={() => void handleCapture()}
            disabled={capturing || !permission?.granted}
          >
            {capturing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>

          <View style={styles.iconBtn} />
        </View>
      </View>
    </Modal>
  );
}

function SelfieOverlay() {
  const { t } = useTranslation();
  return (
    <View style={styles.selfieOverlay} pointerEvents="none">
      <Text style={styles.selfieGuide}>{t('licenseCheck.selfieFrameGuide')}</Text>
      <View style={styles.selfieOval} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: '#0F172A',
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterDisabled: {
    opacity: 0.6,
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.white,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  permissionText: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 15,
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  permissionBtnText: {
    color: colors.white,
    fontWeight: '700',
  },
  selfieOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: spacing.md,
  },
  selfieOval: {
    width: '70%',
    aspectRatio: 3 / 4,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 999,
  },
  selfieGuide: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
