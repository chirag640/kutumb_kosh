import React from 'react';
import { Text, TextProps } from 'react-native';
import { useUIStore } from '../store/uiStore';

interface Props extends TextProps {
  amount: number;
  color?: string;
  size?: number;
}

export function AmountDisplay({ amount, color, size = 16, style, ...props }: Props) {
  const privacyMode = useUIStore(s => s.privacyMode);

  const formatted = privacyMode
    ? '₹ •••••'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  return (
    <Text style={[{ fontSize: size, color: color ?? '#111827', fontWeight: '600' }, style]} {...props}>
      {formatted}
    </Text>
  );
}
