import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
const Alert = { alert: showAlert };

import { router } from 'expo-router';
import * as SecureStore from '../../src/utils/secureStore';
import { useAuthStore } from '../../src/store/authStore';
import {
  getOrCreateSalt,
  deriveKey,
  deriveLoginKey,
  storeVerifyToken,
  storeDBUrl,
  encrypt,
  decrypt,
  enforceSSL,
} from '../../src/crypto';
import { setupRemoteDatabase } from '../../src/sync/engine';
import { insertRecord } from '../../src/db/crud';
import { fetchEncryptedDbUrl, uploadEncryptedDbUrl } from '../../src/utils/adminApi';
import { Buffer } from 'buffer';

type OnboardMode = 'full' | 'new_device';

export default function OnboardingScreen() {
  const [mode, setMode] = useState<OnboardMode>('full');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [dbUrl, setDbUrl] = useState('');
  const [dbVerified, setDbVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [memberName, setMemberName] = useState('');
  const [relationship, setRelationship] = useState<
    'Self' | 'Spouse' | 'Father' | 'Mother' | 'Son' | 'Daughter' | 'Brother' | 'Sister' | 'Other'
  >('Self');
  const [memberDOB, setMemberDOB] = useState('1990-01-01');
  const [memberMobile, setMemberMobile] = useState('');

  // Setup states
  const [derivedCryptoKey, setDerivedCryptoKey] = useState<Uint8Array | null>(null);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const validateCredentials = () => {
    const trimmedEmail = email.trim();
    const trimmedPass = masterPassword.trim();

    if (!trimmedEmail || !trimmedPass) {
      Alert.alert('Error', 'Please fill in both fields.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return false;
    }
    const passwordRegex = /^KK-[A-HJ-NP-Za-hj-km-np-z2-9@#$%]{12}$/;
    if (!passwordRegex.test(trimmedPass)) {
      Alert.alert(
        'Invalid Master Password',
        'The master password must start with "KK-" and be exactly 15 characters long.'
      );
      return false;
    }
    return true;
  };

  // ─── "Login on New Device" flow ───────────────────────────────────────────────

  const handleNewDeviceLogin = async () => {
    if (!validateCredentials()) return;

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPass = masterPassword.trim();

    setLoading(true);
    try {
      // 1. Fetch encrypted DB URL from admin server
      const { encryptedDbUrl } = await fetchEncryptedDbUrl(trimmedEmail, trimmedPass);

      if (!encryptedDbUrl) {
        // User hasn't uploaded DB URL yet — fall back to manual entry
        Alert.alert(
          'DB URL Not Found',
          'Your database URL has not been uploaded from a previous device yet. Please enter it manually.',
          [{ text: 'Enter Manually', onPress: () => { setMode('full'); setStep(3); setLoading(false); } }]
        );
        return;
      }

      // 2. Derive cross-device login key (uses global salt, same on all devices)
      const loginKey = await deriveLoginKey(trimmedPass);

      // 3. Decrypt DB URL locally
      const blob = JSON.parse(encryptedDbUrl) as { iv: string; data: string };
      let resolvedDbUrl: string;
      try {
        resolvedDbUrl = await decrypt(loginKey, blob);
      } catch {
        Alert.alert(
          'Wrong Master Password',
          'Could not decrypt your database URL. Please check your master password and try again.'
        );
        return;
      }

      // 4. Derive device-local key and store credentials
      const salt = await getOrCreateSalt();
      const deviceKey = await deriveKey(trimmedPass, salt);
      setDerivedCryptoKey(deviceKey);

      await SecureStore.setItemAsync('kk_email', trimmedEmail);
      await storeDBUrl(resolvedDbUrl);
      await storeVerifyToken(deviceKey);

      // 5. Move to PIN setup (step 4)
      setDbUrl(resolvedDbUrl);
      setDbVerified(true);
      setStep(4);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Could not connect to server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Full onboarding step handler ────────────────────────────────────────────

  const handleNextStep = async () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (mode === 'new_device') {
        await handleNewDeviceLogin();
        return;
      }

      if (!validateCredentials()) return;

      setLoading(true);
      try {
        const salt = await getOrCreateSalt();
        const key = await deriveKey(masterPassword.trim(), salt);
        setDerivedCryptoKey(key);
        setStep(3);
      } catch {
        Alert.alert('Error', 'Failed to derive secure key. Please try again.');
      } finally {
        setLoading(false);
      }
    } else if (step === 3) {
      if (!dbVerified) {
        Alert.alert('Verification Required', 'Please test and verify your database connection first.');
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        Alert.alert('Invalid PIN', 'PIN must be exactly 6 digits.');
        return;
      }
      if (pin !== confirmPin) {
        Alert.alert('PIN Mismatch', 'PINs do not match.');
        return;
      }
      if (mode === 'new_device') {
        // Skip family member setup for new device login
        await finalizeSetup(true);
      } else {
        setStep(5);
      }
    } else if (step === 5) {
      if (!memberName.trim()) {
        Alert.alert('Error', 'Primary family member name is required.');
        return;
      }
      await finalizeSetup(false);
    }
  };

  const finalizeSetup = async (isNewDevice: boolean) => {
    setLoading(true);
    try {
      if (!derivedCryptoKey) throw new Error('Crypto key not derived');

      const salt = await getOrCreateSalt();
      const pinKeyBytes = await deriveKey(pin, salt);
      const masterKeyHex = Buffer.from(derivedCryptoKey).toString('hex');
      const encryptedMasterKey = await encrypt(pinKeyBytes, masterKeyHex);

      // Store all credentials in SecureStore
      await SecureStore.setItemAsync('kk_email', email.trim().toLowerCase());
      await SecureStore.setItemAsync('kk_pin', pin);
      await SecureStore.setItemAsync('kk_master_password', masterPassword.trim());
      await SecureStore.setItemAsync('kk_encrypted_master_key_pin', JSON.stringify(encryptedMasterKey));
      await SecureStore.setItemAsync('kk_master_key_biometric', masterKeyHex, {
        requireAuthentication: true,
      });

      if (!isNewDevice) {
        await storeDBUrl(dbUrl);
        await storeVerifyToken(derivedCryptoKey);

        // Upload encrypted DB URL to admin server (for future cross-device logins)
        try {
          // Log in first to retrieve and cache JWT session token
          await fetchEncryptedDbUrl(email.trim().toLowerCase(), masterPassword.trim());

          const loginKey = await deriveLoginKey(masterPassword.trim());
          const encryptedDbUrlBlob = await encrypt(loginKey, dbUrl);
          await uploadEncryptedDbUrl(
            email.trim().toLowerCase(),
            JSON.stringify(encryptedDbUrlBlob)
          );
        } catch (uploadErr) {
          // Non-fatal: user can still use the app, just can't use new-device login yet
          console.warn('Failed to upload encrypted DB URL:', uploadErr);
        }

        // Add primary family member
        await insertRecord(
          'family_members',
          {
            name: memberName,
            relationship,
            dateOfBirth: memberDOB,
            mobile: memberMobile,
            aadhaarAvailable: false,
            panAvailable: false,
            bloodGroup: 'Unknown',
          },
          derivedCryptoKey
        );
      }

      // Load into auth store
      const authStore = useAuthStore.getState();
      authStore.setEmail(email.trim().toLowerCase());
      authStore.setKey(derivedCryptoKey);

      Alert.alert('Success', isNewDevice ? 'Device set up successfully!' : 'KutumbKosh setup complete!', [
        { text: "Let's Go", onPress: () => router.replace('/(main)') },
      ]);
    } catch (err) {
      Alert.alert('Setup Failed', err instanceof Error ? err.message : 'Unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const formattedUrl = enforceSSL(dbUrl);
    if (!formattedUrl || !formattedUrl.startsWith('postgresql://')) {
      Alert.alert('Invalid URL', 'Please enter a valid PostgreSQL connection URL.');
      return;
    }
    setLoading(true);
    try {
      const res = await setupRemoteDatabase(formattedUrl);
      if (res.success) {
        setDbUrl(formattedUrl);
        setDbVerified(true);
        Alert.alert('Success', 'Database connection verified and schema tables created!');
      } else {
        setDbVerified(false);
        Alert.alert('Connection Failed', res.error || 'Failed to establish connection.');
      }
    } catch {
      setDbVerified(false);
      Alert.alert('Error', 'An unexpected error occurred while testing connection.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Total steps ─────────────────────────────────────────────────────────────

  const totalSteps = mode === 'new_device' ? 4 : 5;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">

        {/* Step Indicator */}
        {step > 1 && (
          <View style={styles.indicatorContainer}>
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <View
                key={s}
                style={[
                  styles.indicatorDot,
                  step === s && styles.indicatorDotActive,
                  step > s && styles.indicatorDotDone,
                ]}
              />
            ))}
          </View>
        )}

        {/* ── Step 1: Welcome Screen ── */}
        {step === 1 && (
          <View style={styles.stepBox}>
            <Text style={styles.titleMega}>KutumbKosh</Text>
            <Text style={styles.tagline}>Your Private Family Treasury</Text>
            <Text style={styles.description}>
              KutumbKosh is an offline-first, end-to-end encrypted family financial vault.
              Your income, expenses, documents, and investments are secure.
              No admin or third-party can read your data.
            </Text>

            <View style={styles.spacerLarge} />

            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => { setMode('full'); handleNextStep(); }}
            >
              <Text style={styles.buttonTextPrimary}>First Time Setup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.buttonSecondary, { marginTop: 12 }]}
              onPress={() => { setMode('new_device'); setStep(2); }}
            >
              <Text style={styles.buttonTextSecondary}>Login on New Device</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Access Credentials ── */}
        {step === 2 && (
          <View style={styles.stepBox}>
            <Text style={styles.titleDisplay}>
              {mode === 'new_device' ? 'Login on New Device' : 'Enter Access Details'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'new_device'
                ? 'Enter your email and master password. Your database will be automatically retrieved.'
                : 'Use the credentials sent in your welcome email.'}
            </Text>

            <View style={styles.spacer} />
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. name@family.com"
              placeholderTextColor="#868685"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Master Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Starts with KK-..."
              placeholderTextColor="#868685"
              value={masterPassword}
              onChangeText={setMasterPassword}
              autoCapitalize="none"
              secureTextEntry
            />

            <Text style={styles.infoNote}>
              🔐 The master password derives your local AES encryption key. It is never stored in plaintext.
            </Text>

            <View style={styles.spacerLarge} />
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleNextStep} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#0e0f0c" />
              ) : (
                <Text style={styles.buttonTextPrimary}>
                  {mode === 'new_device' ? 'Login & Retrieve DB' : 'Next Step'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => router.push('/(auth)/recover')}
            >
              <Text style={styles.btnGhostText}>Forgot credentials?</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 3: Database Connection (full mode only) ── */}
        {step === 3 && mode === 'full' && (
          <View style={styles.stepBox}>
            <Text style={styles.titleDisplay}>Connect Private DB</Text>
            <Text style={styles.subtitle}>
              Paste your Neon or Supabase connection string. KutumbKosh will auto-migrate your tables.
            </Text>

            <View style={styles.spacer} />
            <Text style={styles.label}>PostgreSQL Connection URL</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="postgresql://user:pass@ep-some-host.neon.tech/neondb"
              placeholderTextColor="#868685"
              value={dbUrl}
              onChangeText={(text) => { setDbUrl(text); setDbVerified(false); }}
              autoCapitalize="none"
              multiline
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.buttonSecondary, dbVerified && styles.buttonSuccess]}
                onPress={handleTestConnection}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#0e0f0c" />
                ) : (
                  <Text style={styles.buttonTextSecondary}>
                    {dbVerified ? '✓ Verified' : 'Test Connection'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.spacerLarge} />
            <TouchableOpacity
              style={[styles.buttonPrimary, !dbVerified && styles.buttonDisabled]}
              onPress={handleNextStep}
              disabled={!dbVerified}
            >
              <Text style={styles.buttonTextPrimary}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 4: Lock PIN ── */}
        {step === 4 && (
          <View style={styles.stepBox}>
            <Text style={styles.titleDisplay}>Create Quick PIN</Text>
            <Text style={styles.subtitle}>Set a 6-digit numeric PIN for quick daily unlocks.</Text>

            <View style={styles.spacer} />
            <Text style={styles.label}>6-Digit PIN</Text>
            <TextInput
              style={styles.inputPIN}
              placeholder="••••••"
              placeholderTextColor="#868685"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              value={pin}
              onChangeText={setPin}
            />

            <Text style={styles.label}>Confirm PIN</Text>
            <TextInput
              style={styles.inputPIN}
              placeholder="••••••"
              placeholderTextColor="#868685"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
            />

            <View style={styles.spacerLarge} />
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleNextStep} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#0e0f0c" />
              ) : (
                <Text style={styles.buttonTextPrimary}>
                  {mode === 'new_device' ? 'Set PIN & Finish' : 'Set PIN & Continue'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 5: Primary Family Member (full mode only) ── */}
        {step === 5 && mode === 'full' && (
          <View style={styles.stepBox}>
            <Text style={styles.titleDisplay}>Primary Profile</Text>
            <Text style={styles.subtitle}>Enter your profile details as the primary user.</Text>

            <View style={styles.spacer} />
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rajesh Patel"
              placeholderTextColor="#868685"
              value={memberName}
              onChangeText={setMemberName}
            />

            <Text style={styles.label}>Mobile Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor="#868685"
              keyboardType="phone-pad"
              value={memberMobile}
              onChangeText={setMemberMobile}
            />

            <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="1990-01-01"
              placeholderTextColor="#868685"
              value={memberDOB}
              onChangeText={setMemberDOB}
            />

            <View style={styles.spacerLarge} />
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleNextStep} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#0e0f0c" />
              ) : (
                <Text style={styles.buttonTextPrimary}>Finish Setup</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  indicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#868685',
    marginHorizontal: 6,
  },
  indicatorDotActive: {
    backgroundColor: '#0e0f0c',
    width: 24,
  },
  indicatorDotDone: {
    backgroundColor: '#9fe870',
  },
  stepBox: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0e0f0c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  titleMega: {
    fontFamily: 'System',
    fontSize: 40,
    fontWeight: '900',
    color: '#0e0f0c',
    textAlign: 'center',
    letterSpacing: -1,
  },
  titleDisplay: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#454745',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 14,
    color: '#454745',
    lineHeight: 20,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#454745',
    lineHeight: 22,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e0f0c',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
  },
  inputPIN: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
  },
  infoNote: {
    fontSize: 11,
    color: '#868685',
    marginTop: 8,
    lineHeight: 16,
  },
  buttonPrimary: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTextPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  buttonSecondary: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  buttonTextSecondary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  buttonSuccess: {
    backgroundColor: '#e2f6d5',
    borderColor: '#2ead4b',
  },
  buttonDisabled: {
    backgroundColor: '#e8ebe6',
    opacity: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  spacer: {
    height: 12,
  },
  spacerLarge: {
    height: 32,
  },
  btnGhost: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnGhostText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#454745',
    textDecorationLine: 'underline',
  },
});
