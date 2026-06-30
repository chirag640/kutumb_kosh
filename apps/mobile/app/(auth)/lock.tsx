import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Vibration,
  ToastAndroid,
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
const Alert = { alert: showAlert };

const showErrorToast = (message: string) => {
  if (RNPlatform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('Error', message);
  }
};

import { router } from 'expo-router';
import * as SecureStore from '../../src/utils/secureStore';
import { useIsMounted } from '../../src/hooks/useIsMounted';
import * as LocalAuthentication from 'expo-local-authentication';
import { Buffer } from 'buffer';
import { useAuthStore } from '../../src/store/authStore';
import { Theme } from '../../src/constants/theme';
import { getOrCreateSalt, deriveKey, decrypt, encrypt } from '../../src/crypto';

type LockStep = 'pin' | 'master-password' | 'set-new-pin';

// Common weak PINs that users should avoid
const WEAK_PINS = new Set(['000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '123456', '12345678', '112233', '121212', '654321']);

export default function LockScreen() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [step, setStep] = useState<LockStep>('pin');
  const [masterPassInput, setMasterPassInput] = useState('');
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const isMounted = useIsMounted();

  // New PIN setup state (after master password unlock)
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [verifiedMasterKey, setVerifiedMasterKey] = useState<Uint8Array | null>(null);
  const pinInputRef = useRef<TextInput>(null);
  const newPinInputRef = useRef<TextInput>(null);
  const confirmPinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    checkBiometrics();
  }, []);

  // Auto-focus the appropriate input when step changes
  useEffect(() => {
    if (step === 'pin' && pinInputRef.current) {
      pinInputRef.current.focus();
    } else if (step === 'set-new-pin' && newPinInputRef.current) {
      newPinInputRef.current.focus();
    }
  }, [step]);

  // Clear PIN fields when transitioning to set-new-pin
  useEffect(() => {
    if (step === 'set-new-pin') {
      setNewPin('');
      setConfirmPin('');
    }
  }, [step]);

  const checkBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isMounted()) return;
      setHasBiometrics(hasHardware && isEnrolled);
      if (hasHardware && isEnrolled) {
        handleBiometricUnlock();
      }
    } catch (e) {
      if (!isMounted()) return;
      console.warn('Biometrics check failed:', e);
      setHasBiometrics(false);
    }
  };

  const handleBiometricUnlock = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock KutumbKosh',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        setLoading(true);
        const biometricKeyHex = await SecureStore.getItemAsync('kk_master_key_biometric', {
          requireAuthentication: true,
        });

        if (biometricKeyHex) {
          const keyBytes = Buffer.from(biometricKeyHex, 'hex');
          useAuthStore.getState().setKey(keyBytes);
          
          const email = await SecureStore.getItemAsync('kk_email');
          if (email) useAuthStore.getState().setEmail(email);

          if (!isMounted()) return;
          router.replace('/(main)');
        }
      }
    } catch (err) {
      console.warn('Biometric authentication failed or canceled', err);
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  // Derive key from PIN to decrypt the master key
  const handlePinUnlock = async (forcedPin?: string) => {
    const pinToUse = forcedPin !== undefined ? forcedPin : pin;
    if (pinToUse.length !== 6) {
      showErrorToast('PIN must be 6 digits.');
      return;
    }
    setLoading(true);

    try {
      const salt = await getOrCreateSalt();
      const pinKeyBytes = await deriveKey(pinToUse, salt);

      const encryptedMasterKeyStr = await SecureStore.getItemAsync('kk_encrypted_master_key_pin');
      
      if (!encryptedMasterKeyStr) {
        showErrorToast('Encryption key not found. Please log in with Master Password.');
        setStep('master-password');
        setLoading(false);
        return;
      }

      const { iv, data } = JSON.parse(encryptedMasterKeyStr);

      try {
        const decryptedKeyHex = await decrypt(pinKeyBytes, { iv, data });
        const masterKeyBytes = Buffer.from(decryptedKeyHex, 'hex');

        useAuthStore.getState().setKey(masterKeyBytes);
        const email = await SecureStore.getItemAsync('kk_email');
        if (email) useAuthStore.getState().setEmail(email);

        if (!isMounted()) return;
        router.replace('/(main)');
      } catch {
        if (!isMounted()) return;
        Vibration.vibrate([0, 50, 100, 50]);
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        setPin('');
        
        if (newAttempts >= 5) {
          setStep('master-password');
          showErrorToast('Too many incorrect PIN attempts. Please enter your Master Password.');
        } else {
          showErrorToast(`Invalid PIN. ${5 - newAttempts} attempts remaining.`);
        }
      }
    } catch (err) {
      if (!isMounted()) return;
      showErrorToast('An error occurred during unlock.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  // Step 1: Verify master password
  const handleMasterPassUnlock = async () => {
    if (!masterPassInput.trim()) {
      showErrorToast('Please enter your Master Password.');
      return;
    }
    setLoading(true);

    try {
      const salt = await getOrCreateSalt();
      const masterKeyBytes = await deriveKey(masterPassInput, salt);
      
      const stored = await SecureStore.getItemAsync('kk_verify_token');
      if (stored) {
        const { iv, data } = JSON.parse(stored);
        try {
          const decrypted = await decrypt(masterKeyBytes, { iv, data });
          if (decrypted !== 'kutumbkosh_verify_ok') throw new Error();
        } catch {
          showErrorToast('Invalid Master Password.');
          setLoading(false);
          return;
        }
      }

      // Master password verified — transition to new PIN setup
      setVerifiedMasterKey(masterKeyBytes);
      setStep('set-new-pin');
      if (isMounted()) {
        setLoading(false);
      }
    } catch (err) {
      if (!isMounted()) return;
      showErrorToast('Authentication failed.');
      setLoading(false);
    }
  };

  // Step 2: Set a new PIN (user-chosen, not default)
  const handleSetNewPin = async () => {
    if (newPin.length !== 6) {
      showErrorToast('New PIN must be 6 digits.');
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      showErrorToast('PIN must contain only numbers.');
      return;
    }
    if (newPin !== confirmPin) {
      showErrorToast('PINs do not match. Please try again.');
      setNewPin('');
      setConfirmPin('');
      return;
    }
    if (WEAK_PINS.has(newPin)) {
      showErrorToast('This PIN is too common. Please choose a more secure 6-digit PIN.');
      setNewPin('');
      setConfirmPin('');
      return;
    }
    if (!verifiedMasterKey) {
      showErrorToast('Session expired. Please start over.');
      setStep('master-password');
      return;
    }

    setLoading(true);
    try {
      const salt = await getOrCreateSalt();
      const pinKeyBytes = await deriveKey(newPin, salt);
      
      const masterKeyHex = Buffer.from(verifiedMasterKey).toString('hex');
      const encryptedMasterKey = await encrypt(pinKeyBytes, masterKeyHex);
      
      await SecureStore.setItemAsync('kk_encrypted_master_key_pin', JSON.stringify(encryptedMasterKey));
      await SecureStore.setItemAsync('kk_pin', newPin);

      // Save biometrics
      await SecureStore.setItemAsync('kk_master_key_biometric', masterKeyHex, {
        requireAuthentication: true,
      });

      // Load into store
      useAuthStore.getState().setKey(verifiedMasterKey);
      const email = await SecureStore.getItemAsync('kk_email');
      if (email) useAuthStore.getState().setEmail(email);

      if (!isMounted()) return;
      showErrorToast('PIN Updated: Your new PIN has been set successfully.');
      router.replace('/(main)');
    } catch (err) {
      if (!isMounted()) return;
      showErrorToast('Failed to set new PIN. Please try again.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>KutumbKosh</Text>
        <Text style={styles.title}>Welcome Back</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color="#0e0f0c" style={styles.loader} />
        ) : step === 'master-password' ? (
          <View style={styles.inputContainer}>
            <Text style={styles.subtitle}>Enter Master Password to verify your identity and set a new PIN.</Text>
            <Text style={styles.label}>Master Password</Text>
            <TextInput 
              style={styles.input}
              placeholder="KK-..."
              placeholderTextColor="#868685"
              secureTextEntry
              value={masterPassInput}
              onChangeText={setMasterPassInput}
              autoCapitalize="none"
              autoFocus
            />
             <TouchableOpacity 
               style={styles.button} 
               onPress={handleMasterPassUnlock}
               accessibilityLabel="Verify Identity"
               accessibilityRole="button"
               accessibilityHint="Verifies entered master password to unlock screen"
             >
               <Text style={styles.buttonText}>Verify Identity</Text>
             </TouchableOpacity>
          </View>
        ) : step === 'set-new-pin' ? (
          <View style={styles.pinContainer}>
            <Text style={styles.subtitle}>Set a new 6-digit PIN for daily unlock.</Text>
            
            <Text style={styles.label}>New PIN</Text>
            <TextInput
              ref={newPinInputRef}
              style={styles.pinInput}
              placeholder="••••••"
              placeholderTextColor="#868685"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              value={newPin}
              onChangeText={setNewPin}
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Confirm New PIN</Text>
            <TextInput
              ref={confirmPinInputRef}
              style={styles.pinInput}
              placeholder="••••••"
              placeholderTextColor="#868685"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
            />

            <TouchableOpacity 
              style={styles.button} 
              onPress={handleSetNewPin}
              accessibilityLabel="Set PIN and Unlock"
              accessibilityRole="button"
              accessibilityHint="Saves the new lock PIN and unlocks the application"
            >
              <Text style={styles.buttonText}>Set PIN & Unlock</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pinContainer}>
            <Text style={styles.subtitle}>Enter your 6-digit PIN to unlock.</Text>
            
            <TextInput 
              style={styles.pinInput}
              placeholder="••••••"
              placeholderTextColor="#868685"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              value={pin}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9]/g, '');
                if (cleaned.length <= 6) {
                  setPin(cleaned);
                }
                if (cleaned.length === 6 && !loading) {
                  // Auto trigger unlock when 6 digits are entered
                  handlePinUnlock(cleaned);
                }
              }}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={styles.buttonPrimary} 
                onPress={handlePinUnlock}
                accessibilityLabel="Unlock Application"
                accessibilityRole="button"
                accessibilityHint="Authenticates using entered 6-digit PIN"
              >
                <Text style={styles.buttonText}>Unlock</Text>
              </TouchableOpacity>
            </View>

            {hasBiometrics && (
              <TouchableOpacity 
                style={styles.biometricBtn} 
                onPress={handleBiometricUnlock}
                accessibilityLabel="Unlock with Biometrics"
                accessibilityRole="button"
                accessibilityHint="Authenticates using stored Face ID or Fingerprint"
              >
                <Text style={styles.biometricText}>Unlock with Face ID / Fingerprint</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => router.push('/(auth)/recover')}
              accessibilityLabel="Forgot credentials"
              accessibilityRole="link"
              accessibilityHint="Navigates to security lock recovery screen"
            >
              <Text style={styles.forgotText}>Forgot credentials?</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Theme.colors.white,
    borderRadius: 24,
    padding: 32,
    shadowColor: Theme.colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
    color: Theme.colors.ink,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.colors.body,
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 14,
    color: Theme.colors.subtle,
    textAlign: 'center',
    marginBottom: 24,
  },
  loader: {
    marginVertical: 40,
  },
  inputContainer: {
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.ink,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1.5,
    borderColor: Theme.colors.ink,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Theme.colors.ink,
    backgroundColor: Theme.colors.white,
    marginBottom: 20,
    width: '100%',
  },
  button: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    flex: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.ink,
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
  },
  pinInput: {
    borderWidth: 1.5,
    borderColor: Theme.colors.ink,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    color: Theme.colors.ink,
    backgroundColor: Theme.colors.white,
    width: '100%',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 16,
  },
  biometricBtn: {
    marginTop: 16,
    padding: 8,
  },
  biometricText: {
    color: Theme.colors.body,
    fontWeight: '600',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  forgotBtn: {
    marginTop: 24,
    padding: 8,
  },
  forgotText: {
    color: Theme.colors.subtle,
    fontWeight: '500',
    fontSize: 13,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
