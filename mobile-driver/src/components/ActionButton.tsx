import { Button, type ButtonVariant } from '@/components/ui/Button';

export function ActionButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'secondary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      variant={variant}
    />
  );
}
