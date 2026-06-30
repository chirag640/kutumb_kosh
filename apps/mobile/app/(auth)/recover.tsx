import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { requestRecoveryOtp, verifyRecoveryOtp } from '../../src/utils/adminApi';
import { useIsMounted } from '../../src/hooks/useIsMounted';
import { showAlert } from '../../src/utils/alert';
const Alert = { alert: showAlert };

type RecoveryStep = 'email' | 'otp' | 'done';

export default function RecoverScreen() {
  const [step, setStep] = useState<RecoveryStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const isMounted = useIsMounted();

  const handleRequestOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      await requestRecoveryOtp(trimmedEmail);
      if (!isMounted()) return;
      // Always move to OTP step (server doesn't reveal if email exists)
      setStep('otp');
    } catch (err) {
      if (!isMounted()) return;
      Alert.alert('Error', 'Could not send OTP. Please check your connection and try again.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6 || !/^\d+$/.test(trimmedOtp)) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      await verifyRecoveryOtp(email.trim().toLowerCase(), trimmedOtp);
      if (!isMounted()) return;
      setStep('done');
    } catch (err: any) {
      if (!isMounted()) return;
      Alert.alert(
        'Verification Failed',
        err.message || 'The code was incorrect or expired. Please try again.'
      );
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          accessibilityHint="Returns to the previous screen"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          {/* Step indicators */}
          <View style={styles.stepRow}>
            {(['email', 'otp', 'done'] as RecoveryStep[]).map((s, i) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  step === s && styles.stepDotActive,
                  (['email', 'otp', 'done'] as RecoveryStep[]).indexOf(step) > i && styles.stepDotDone,
                ]}
              />
            ))}
          </View>

          {/* ── Step 1: Email entry ── */}
          {step === 'email' && (
            <View>
              <Text style={styles.title}>Recover Credentials</Text>
              <Text style={styles.subtitle}>
                Enter your registered email address and we'll send you a one-time verification code.
              </Text>

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                id="recovery-email"
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor="#868685"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleRequestOtp}
                disabled={loading}
                accessibilityLabel="Send Recovery Code"
                accessibilityRole="button"
                accessibilityHint="Requests one-time code to be sent to the email address above"
              >
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Send Recovery Code</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 2: OTP entry ── */}
          {step === 'otp' && (
            <View>
              <Text style={styles.title}>Enter Verification Code</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to{' '}
                <Text style={styles.emailHighlight}>{email}</Text>. It expires in 10 minutes.
              </Text>

              <Text style={styles.label}>6-Digit Code</Text>
              <TextInput
                id="recovery-otp"
                style={styles.otpInput}
                placeholder="000000"
                placeholderTextColor="#868685"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="numeric"
                maxLength={6}
                textAlign="center"
              />

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleVerifyOtp}
                disabled={loading}
                accessibilityLabel="Verify and Send Recovery Email"
                accessibilityRole="button"
                accessibilityHint="Verifies entered code and sends master password details to email"
              >
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Verify & Send Recovery Email</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => { setStep('email'); setOtp(''); }}
                disabled={loading}
                accessibilityLabel="Resend Code"
                accessibilityRole="button"
                accessibilityHint="Returns to email input stage to request new code"
              >
                <Text style={styles.btnGhostText}>Resend Code</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && (
            <View style={styles.doneContainer}>
              <View style={styles.doneIcon}>
                <Text style={styles.doneEmoji}>✉️</Text>
              </View>
              <Text style={styles.doneTitle}>Recovery Email Sent!</Text>
              <Text style={styles.doneSubtitle}>
                Check your inbox at{' '}
                <Text style={styles.emailHighlight}>{email}</Text>. Your master password has been sent.
                Once you have it, use <Text style={{ fontWeight: '700' }}>"Login on New Device"</Text> on the onboarding screen to get back in.
              </Text>

              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  🔐 After logging back in, you'll be prompted to set a new PIN for quick daily unlocking.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => router.replace('/(auth)/onboarding')}
                accessibilityLabel="Go to Login"
                accessibilityRole="button"
                accessibilityHint="Returns to the main onboarding and login screen"
              >
                <Text style={styles.btnPrimaryText}>Go to Login</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 56,
  },
  backBtn: {
    marginBottom: 20,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#454745',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#0e0f0c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#d0d0ce',
  },
  stepDotActive: {
    backgroundColor: '#0e0f0c',
    width: 24,
  },
  stepDotDone: {
    backgroundColor: '#9fe870',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#454745',
    lineHeight: 21,
    marginBottom: 24,
  },
  emailHighlight: {
    fontWeight: '700',
    color: '#0e0f0c',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0e0f0c',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
    marginBottom: 20,
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 12,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
    marginBottom: 20,
  },
  btnPrimary: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  btnGhost: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnGhostText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#454745',
    textDecorationLine: 'underline',
  },
  doneContainer: {
    alignItems: 'center',
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e2f6d5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  doneEmoji: {
    fontSize: 32,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0e0f0c',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  doneSubtitle: {
    fontSize: 14,
    color: '#454745',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  infoBox: {
    backgroundColor: '#e2f6d5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  infoBoxText: {
    fontSize: 13,
    color: '#163300',
    lineHeight: 19,
    fontWeight: '500',
  },
});
