import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator 
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
const Alert = { alert: showAlert };

import { router } from 'expo-router';
import * as SecureStore from '../../src/utils/secureStore';
import * as LocalAuthentication from 'expo-local-authentication';
import { Buffer } from 'buffer';
import { useAuthStore } from '../../src/store/authStore';
import { getOrCreateSalt, deriveKey, decrypt, encrypt } from '../../src/crypto';

export default function LockScreen() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [requireMasterPass, setRequireMasterPass] = useState(false);
  const [masterPassInput, setMasterPassInput] = useState('');
  const [hasBiometrics, setHasBiometrics] = useState(false);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometrics(hasHardware && isEnrolled);
      if (hasHardware && isEnrolled) {
        handleBiometricUnlock();
      }
    } catch (e) {
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
        // Retrieve master password or verification token from biometric-protected SecureStore
        // Note: For biometrics, we can store the derived key itself in a biometric-gated SecureStore key
        // Or if we encrypted the master key using a biometrics-gated key.
        // Let's check if we have a biometric key stored:
        const biometricKeyHex = await SecureStore.getItemAsync('kk_master_key_biometric', {
          requireAuthentication: true,
        });

        if (biometricKeyHex) {
          const keyBytes = Buffer.from(biometricKeyHex, 'hex');
          useAuthStore.getState().setKey(keyBytes);
          
          const email = await SecureStore.getItemAsync('kk_email');
          if (email) useAuthStore.getState().setEmail(email);

          router.replace('/(main)');
        } else {
          // If no biometric key exists (e.g. first time enabling or fallback), use PIN
          console.log('No biometric key found in SecureStore');
        }
      }
    } catch (err) {
      console.log('Biometric authentication failed or canceled', err);
    } finally {
      setLoading(false);
    }
  };

  // Derive key from PIN to decrypt the master key
  const handlePinUnlock = async () => {
    if (pin.length !== 6) {
      Alert.alert('Error', 'PIN must be 6 digits.');
      return;
    }
    setLoading(true);

    try {
      // 1. Get salt
      const salt = await getOrCreateSalt();
      
      // 2. Derive key from PIN
      const pinKeyBytes = await deriveKey(pin, salt);

      // 3. Retrieve encrypted master key blob from SecureStore
      const encryptedMasterKeyStr = await SecureStore.getItemAsync('kk_encrypted_master_key_pin');
      
      if (!encryptedMasterKeyStr) {
        // Fallback: If encrypted key is not found, we ask for master password
        Alert.alert('Configuration Error', 'Encryption key not found. Please log in with Master Password.');
        setRequireMasterPass(true);
        setLoading(false);
        return;
      }

      const { iv, data } = JSON.parse(encryptedMasterKeyStr);
      
      // 4. Decrypt master key using PIN-derived key
      try {
        const decryptedKeyHex = await decrypt(pinKeyBytes, { iv, data });
        const masterKeyBytes = Buffer.from(decryptedKeyHex, 'hex');

        // 5. Load into authStore and proceed
        useAuthStore.getState().setKey(masterKeyBytes);
        const email = await SecureStore.getItemAsync('kk_email');
        if (email) useAuthStore.getState().setEmail(email);

        router.replace('/(main)');
      } catch (decryptErr) {
        // Decryption failed means PIN was wrong
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        setPin('');
        
        if (newAttempts >= 5) {
          setRequireMasterPass(true);
          Alert.alert('Brute Force Lockout', 'Too many incorrect PIN attempts. Please enter your Master Password.');
        } else {
          Alert.alert('Incorrect PIN', `Invalid PIN. ${5 - newAttempts} attempts remaining.`);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred during unlock.');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterPassUnlock = async () => {
    if (!masterPassInput.trim()) {
      Alert.alert('Error', 'Please enter your Master Password.');
      return;
    }
    setLoading(true);

    try {
      const salt = await getOrCreateSalt();
      const masterKeyBytes = await deriveKey(masterPassInput, salt);
      
      // Verify key
      const stored = await SecureStore.getItemAsync('kk_verify_token');
      if (stored) {
        const { iv, data } = JSON.parse(stored);
        try {
          const decrypted = await decrypt(masterKeyBytes, { iv, data });
          if (decrypted !== 'kutumbkosh_verify_ok') throw new Error();
        } catch {
          Alert.alert('Incorrect Password', 'Invalid Master Password.');
          setLoading(false);
          return;
        }
      }

      // If correct, re-encrypt master key using a default PIN (reset needed)
      const pinCode = '123456';
      const pinKeyBytes = await deriveKey(pinCode, salt);
      
      const masterKeyHex = Buffer.from(masterKeyBytes).toString('hex');
      const encryptedMasterKey = await encrypt(pinKeyBytes, masterKeyHex);
      await SecureStore.setItemAsync('kk_encrypted_master_key_pin', JSON.stringify(encryptedMasterKey));
      await SecureStore.setItemAsync('kk_pin', pinCode);

      // Save biometrics
      await SecureStore.setItemAsync('kk_master_key_biometric', masterKeyHex, {
        requireAuthentication: true,
      });

      // Load into store
      useAuthStore.getState().setKey(masterKeyBytes);
      const email = await SecureStore.getItemAsync('kk_email');
      if (email) useAuthStore.getState().setEmail(email);

      Alert.alert('Unlocked', `PIN reset to default: ${pinCode}. Please change it in settings.`, [
        { text: 'OK', onPress: () => router.replace('/(main)') }
      ]);
    } catch (err) {
      Alert.alert('Error', 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>KutumbKosh</Text>
        <Text style={styles.title}>Welcome Back</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color="#0e0f0c" style={styles.loader} />
        ) : requireMasterPass ? (
          <View style={styles.inputContainer}>
            <Text style={styles.subtitle}>Enter Master Password to reset unlock lock.</Text>
            <Text style={styles.label}>Master Password</Text>
            <TextInput 
              style={styles.input}
              placeholder="KK-..."
              placeholderTextColor="#868685"
              secureTextEntry
              value={masterPassInput}
              onChangeText={setMasterPassInput}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.button} onPress={handleMasterPassUnlock}>
              <Text style={styles.buttonText}>Unlock & Reset PIN</Text>
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
                setPin(text);
                if (text.length === 6) {
                  // Auto trigger unlock when 6 digits are entered
                  setPin(text);
                }
              }}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.buttonPrimary} onPress={handlePinUnlock}>
                <Text style={styles.buttonText}>Unlock</Text>
              </TouchableOpacity>
            </View>

            {hasBiometrics && (
              <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricUnlock}>
                <Text style={styles.biometricText}>Unlock with Face ID / Fingerprint</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#0e0f0c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    alignItems: 'center',
  },
  logo: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0e0f0c',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#454745',
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 14,
    color: '#868685',
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
    color: '#0e0f0c',
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
    marginBottom: 20,
    width: '100%',
  },
  button: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    flex: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  pinContainer: {
    width: '100%',
    alignItems: 'center',
  },
  pinInput: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
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
    color: '#454745',
    fontWeight: '600',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
