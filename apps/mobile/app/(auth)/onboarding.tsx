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
  Platform
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
const Alert = { alert: showAlert };

import { router } from 'expo-router';
import * as SecureStore from '../../src/utils/secureStore';
import { useAuthStore } from '../../src/store/authStore';
import { getOrCreateSalt, deriveKey, storeVerifyToken, storeDBUrl, encrypt, enforceSSL } from '../../src/crypto';
import { setupRemoteDatabase } from '../../src/sync/engine';
import { insertRecord } from '../../src/db/crud';
import { Buffer } from 'buffer';

export default function OnboardingScreen() {
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
  const [relationship, setRelationship] = useState<'Self' | 'Spouse' | 'Father' | 'Mother' | 'Son' | 'Daughter' | 'Brother' | 'Sister' | 'Other'>('Self');
  const [memberDOB, setMemberDOB] = useState('1990-01-01');
  const [memberMobile, setMemberMobile] = useState('');

  // Setup states
  const [derivedCryptoKey, setDerivedCryptoKey] = useState<Uint8Array | null>(null);

  const handleNextStep = async () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      const trimmedEmail = email.trim();
      const trimmedPass = masterPassword.trim();

      if (!trimmedEmail || !trimmedPass) {
        Alert.alert('Error', 'Please fill in both fields.');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        Alert.alert('Invalid Email', 'Please enter a valid email address.');
        return;
      }

      const passwordRegex = /^KK-[A-HJ-NP-Za-hj-km-np-z2-9@#$%]{12}$/;
      if (!passwordRegex.test(trimmedPass)) {
        Alert.alert(
          'Invalid Master Password',
          'The master password must be exactly 15 characters long, start with "KK-", and contain only valid characters (no ambiguous characters like 0, 1, I, O, or l).'
        );
        return;
      }

      setLoading(true);
      try {
        const salt = await getOrCreateSalt();
        const key = await deriveKey(trimmedPass, salt);
        setDerivedCryptoKey(key);
        setStep(3);
      } catch (err) {
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
      setStep(5);
    } else if (step === 5) {
      if (!memberName.trim()) {
        Alert.alert('Error', 'Primary family member name is required.');
        return;
      }
      
      // Save all credentials and finalize
      setLoading(true);
      try {
        if (!derivedCryptoKey) throw new Error('Crypto key not derived');

        // Store configuration in SecureStore
        await SecureStore.setItemAsync('kk_email', email);
        await SecureStore.setItemAsync('kk_pin', pin);
        await storeDBUrl(dbUrl);
        await storeVerifyToken(derivedCryptoKey);

        // Derive PIN key and encrypt master key
        const salt = await getOrCreateSalt();
        const pinKeyBytes = await deriveKey(pin, salt);

        // Encrypt master key using PIN key via shared encrypt function
        const masterKeyHex = Buffer.from(derivedCryptoKey).toString('hex');
        const encryptedMasterKey = await encrypt(pinKeyBytes, masterKeyHex);

        await SecureStore.setItemAsync('kk_encrypted_master_key_pin', JSON.stringify(encryptedMasterKey));

        // Store master key for biometrics
        await SecureStore.setItemAsync('kk_master_key_biometric', masterKeyHex, {
          requireAuthentication: true,
        });

        // Add primary family member to local DB
        await insertRecord('family_members', {
          name: memberName,
          relationship: relationship,
          dateOfBirth: memberDOB,
          mobile: memberMobile,
          aadhaarAvailable: false,
          panAvailable: false,
          bloodGroup: 'Unknown',
        }, derivedCryptoKey);

        // Store key in memory and unlock
        const authStore = useAuthStore.getState();
        authStore.setEmail(email);
        authStore.setKey(derivedCryptoKey);

        Alert.alert('Success', 'KutumbKosh setup complete!', [
          { text: 'Let\'s Go', onPress: () => router.replace('/(main)') }
        ]);
      } catch (err) {
        Alert.alert('Setup Failed', err instanceof Error ? err.message : 'Unknown error occurred.');
      } finally {
        setLoading(false);
      }
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
    } catch (err) {
      setDbVerified(false);
      Alert.alert('Error', 'An unexpected error occurred while testing connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        
        {/* Step Indicator */}
        <View style={styles.indicatorContainer}>
          {[1, 2, 3, 4, 5].map((s) => (
            <View 
              key={s} 
              style={[
                styles.indicatorDot, 
                step === s && styles.indicatorDotActive,
                step > s && styles.indicatorDotDone
              ]} 
            />
          ))}
        </View>

        {/* Step 1: Welcome Screen */}
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
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleNextStep}>
              <Text style={styles.buttonTextPrimary}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Access Credentials */}
        {step === 2 && (
          <View style={styles.stepBox}>
            <Text style={styles.titleDisplay}>Enter Access Details</Text>
            <Text style={styles.subtitle}>Use the credentials sent in your welcome email.</Text>
            
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
              🔐 The master password derives your local AES encryption key. It is never stored.
            </Text>

            <View style={styles.spacerLarge} />
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleNextStep} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#0e0f0c" />
              ) : (
                <Text style={styles.buttonTextPrimary}>Next Step</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Database Connection */}
        {step === 3 && (
          <View style={styles.stepBox}>
            <Text style={styles.titleDisplay}>Connect Private DB</Text>
            <Text style={styles.subtitle}>Paste your Neon or Supabase connection string. KutumbKosh will auto-migrate your tables.</Text>
            
            <View style={styles.spacer} />
            <Text style={styles.label}>PostgreSQL Connection URL</Text>
            <TextInput 
              style={[styles.input, { height: 80 }]}
              placeholder="postgresql://user:pass@ep-some-host.neon.tech/neondb"
              placeholderTextColor="#868685"
              value={dbUrl}
              onChangeText={(text) => {
                setDbUrl(text);
                setDbVerified(false);
              }}
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

        {/* Step 4: Lock PIN */}
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
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleNextStep}>
              <Text style={styles.buttonTextPrimary}>Set PIN & Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 5: Primary Family Member */}
        {step === 5 && (
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
    backgroundColor: '#e8ebe6', // Canvas Soft
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
    backgroundColor: '#0e0f0c', // Ink
    width: 24,
  },
  indicatorDotDone: {
    backgroundColor: '#9fe870', // Primary Green
  },
  stepBox: {
    backgroundColor: '#ffffff', // Canvas
    borderRadius: 24, // rounded.xl
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
    borderRadius: 12, // rounded.md
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
    backgroundColor: '#9fe870', // Primary Green
    borderRadius: 9999, // fully rounded pill
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTextPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0e0f0c', // on-primary
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
});
