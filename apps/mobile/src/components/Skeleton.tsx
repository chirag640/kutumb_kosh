import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Theme } from '../constants/theme';

export function SkeletonPulse({ children, style }: { children: React.ReactNode; style?: any }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return <Animated.View style={[{ opacity: pulseAnim }, style] as any}>{children as any}</Animated.View>;
}

export function SkeletonCard() {
  return (
    <SkeletonPulse style={styles.card}>
      <View style={styles.badge} />
      <View style={styles.title} />
      <View style={styles.line} />
      <View style={[styles.line, { width: '50%' }]} />
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.white,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.colors.ink,
    padding: 16,
    marginBottom: 12,
  },
  badge: {
    width: 85,
    height: 18,
    borderRadius: 6,
    backgroundColor: Theme.colors.background,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.colors.ink,
  },
  title: {
    width: '75%',
    height: 18,
    borderRadius: 4,
    backgroundColor: Theme.colors.background,
    marginBottom: 8,
  },
  line: {
    width: '90%',
    height: 12,
    borderRadius: 4,
    backgroundColor: Theme.colors.background,
    marginBottom: 6,
  },
});
