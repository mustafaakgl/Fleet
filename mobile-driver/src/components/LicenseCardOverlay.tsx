import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, spacing } from '@/theme';

/** ISO/IEC 7810 ID-1 driving licence card: 85.6 × 54 mm */
export const LICENSE_CARD_ASPECT_RATIO = 85.6 / 54;

type LicenseCardOverlayProps = {
  guideText?: string;
};

export function LicenseCardOverlay({ guideText }: LicenseCardOverlayProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.dim} />
      <View style={styles.centerRow}>
        <View style={styles.dimSide} />
        <View style={styles.frameWrap}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.guide}>{guideText ?? t('licenseCheck.frameGuide')}</Text>
        </View>
        <View style={styles.dimSide} />
      </View>
      <View style={styles.dim} />
    </View>
  );
}

const FRAME_BORDER = 3;
const CORNER_LEN = 22;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  dim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dimSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignSelf: 'stretch',
  },
  frameWrap: {
    width: '82%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.sm,
  },
  frame: {
    width: '100%',
    aspectRatio: LICENSE_CARD_ASPECT_RATIO,
    borderWidth: FRAME_BORDER,
    borderColor: colors.white,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderColor: '#38BDF8',
  },
  cornerTL: {
    top: -FRAME_BORDER,
    left: -FRAME_BORDER,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -FRAME_BORDER,
    right: -FRAME_BORDER,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -FRAME_BORDER,
    left: -FRAME_BORDER,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -FRAME_BORDER,
    right: -FRAME_BORDER,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  guide: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
