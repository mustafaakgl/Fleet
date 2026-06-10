import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from '@/i18n/useTranslation';
import { showError } from '@/utils/feedback';
import { colors, radius, spacing } from '@/theme';

type HandoverCameraModalProps = {
  visible: boolean;
  slotLabel: string;
  onClose: () => void;
  onCaptured: (result: { uri: string; name: string; type: string }) => void;
};

export function HandoverCameraModal({
  visible,
  slotLabel,
  onClose,
  onCaptured,
}: HandoverCameraModalProps) {
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
        quality: 0.9,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        showError(t('handover.captureFailed'));
        return;
      }

      onCaptured({
        uri: photo.uri,
        name: `handover-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
      onClose();
    } catch {
      showError(t('handover.captureFailed'));
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
            <Text style={styles.permissionText}>{t('handover.cameraPermissionRequired')}</Text>
            <Text style={styles.permissionSubtext}>{t('handover.cameraPermissionBlocked')}</Text>
            <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
              <Text style={styles.permissionBtnText}>{t('handover.grantCamera')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <Text style={styles.slotLabel}>{slotLabel}</Text>
          </>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  slotLabel: {
    position: 'absolute',
    top: spacing.lg,
    alignSelf: 'center',
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
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
    fontSize: 16,
    fontWeight: '700',
  },
  permissionSubtext: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.9,
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
});
