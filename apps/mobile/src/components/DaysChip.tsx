import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function DaysChip({ daysRemaining }: { daysRemaining: number }) {
  const config = daysRemaining < 0
    ? { label: 'Overdue', bg: '#FEE2E2', text: '#991B1B' }
    : daysRemaining === 0
    ? { label: 'Today', bg: '#FEE2E2', text: '#B91C1C' }
    : daysRemaining <= 7
    ? { label: `${daysRemaining}d`, bg: '#FEE2E2', text: '#B91C1C' }
    : daysRemaining <= 30
    ? { label: `${daysRemaining}d`, bg: '#FFEDD5', text: '#C2410C' }
    : daysRemaining <= 60
    ? { label: `${daysRemaining}d`, bg: '#FEF9C3', text: '#854D0E' }
    : { label: `${daysRemaining}d`, bg: '#DCFCE7', text: '#166534' };

  return (
    <View style={[styles.chip, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  label: { fontSize: 11, fontWeight: '600' },
});
