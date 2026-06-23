import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Switch, 
  ActivityIndicator 
} from 'react-native';
import { showAlert } from '../../../src/utils/alert';
const Alert = { alert: showAlert };
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from '../../../src/utils/secureStore';
import * as LocalAuthentication from 'expo-local-authentication';
import { Buffer } from 'buffer';
import { useAuthStore } from '../../../src/store/authStore';
import { getOrCreateSalt, deriveKey, encrypt } from '../../../src/crypto';

export default function SecuritySettingsScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [hasHardware, setHasHardware] = useState(false);

  // Form states
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setHasHardware(hardware && enrolled);
    
    // Check if biometric key is active in SecureStore
    const bioKey = await SecureStore.getItemAsync('kk_master_key_biometric');
    setBiometricsEnabled(!!bioKey);
  };

  const handleToggleBiometrics = async (val: boolean) => {
    if (!cryptoKey) return;
    setLoading(true);

    try {
      if (val) {
        // Authenticate user first
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Enable Biometric Unlock',
        });

        if (auth.success) {
          // Store the derived master key in biometric-protected SecureStore
          const masterKeyHex = Buffer.from(cryptoKey).toString('hex');
          await SecureStore.setItemAsync('kk_master_key_biometric', masterKeyHex, {
            requireAuthentication: true,
          });
          setBiometricsEnabled(true);
          Alert.alert('Success', 'Biometric unlock enabled successfully.');
        } else {
          setBiometricsEnabled(false);
        }
      } else {
        // Delete biometric key
        await SecureStore.deleteItemAsync('kk_master_key_biometric');
        setBiometricsEnabled(false);
        Alert.alert('Disabled', 'Biometric unlock disabled.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to configure biometrics.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async () => {
    if (!cryptoKey) return;
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      Alert.alert('Invalid PIN', 'New PIN must be exactly 6 digits.');
      return;
    }
    if (newPin !== confirmNewPin) {
      Alert.alert('Mismatch', 'Confirm PIN does not match.');
      return;
    }

    setLoading(true);
    try {
      const salt = await getOrCreateSalt();
      const storedPin = await SecureStore.getItemAsync('kk_pin');

      if (oldPin !== storedPin) {
        Alert.alert('Incorrect PIN', 'Current PIN is incorrect.');
        setLoading(false);
        return;
      }

      // Re-derive new PIN key and encrypt master key
      const pinKeyBytes = await deriveKey(newPin, salt);

      // Encrypt master key with new PIN key
      const masterKeyHex = Buffer.from(cryptoKey).toString('hex');
      const encryptedMasterKey = await encrypt(pinKeyBytes, masterKeyHex);

      await SecureStore.setItemAsync('kk_encrypted_master_key_pin', JSON.stringify(encryptedMasterKey));
      await SecureStore.setItemAsync('kk_pin', newPin);

      Alert.alert('Success', 'Unlock PIN updated successfully.');
      setOldPin('');
      setNewPin('');
      setConfirmNewPin('');
    } catch (err) {
      Alert.alert('Error', 'Failed to update PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>PIN & Biometrics</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Biometrics Toggle Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Biometric Options</Text>
        
        <View style={styles.row}>
          <View style={styles.meta}>
            <Text style={styles.label}>Unlock with Face ID / Fingerprint</Text>
            <Text style={styles.desc}>
              {!hasHardware 
                ? 'Biometric hardware not available or no profiles registered.' 
                : 'Use device biometric lock for fast unlocks.'}
            </Text>
          </View>
          <Switch 
            value={biometricsEnabled} 
            onValueChange={handleToggleBiometrics} 
            disabled={!hasHardware || loading}
            trackColor={{ false: '#e8ebe6', true: '#9fe870' }}
            thumbColor={biometricsEnabled ? '#0e0f0c' : '#ffffff'}
          />
        </View>
      </View>

      {/* Change PIN Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Change Unlock PIN</Text>
        <Text style={styles.desc}>PIN must be a 6-digit numeric combination.</Text>
        
        <View style={styles.formSpacer} />
        
        <Text style={styles.inputLabel}>Current 6-Digit PIN</Text>
        <TextInput 
          style={styles.input}
          placeholder="••••••"
          placeholderTextColor="#868685"
          keyboardType="numeric"
          maxLength={6}
          secureTextEntry
          value={oldPin}
          onChangeText={setOldPin}
        />

        <Text style={styles.inputLabel}>New 6-Digit PIN</Text>
        <TextInput 
          style={styles.input}
          placeholder="••••••"
          placeholderTextColor="#868685"
          keyboardType="numeric"
          maxLength={6}
          secureTextEntry
          value={newPin}
          onChangeText={setNewPin}
        />

        <Text style={styles.inputLabel}>Confirm New PIN</Text>
        <TextInput 
          style={styles.input}
          placeholder="••••••"
          placeholderTextColor="#868685"
          keyboardType="numeric"
          maxLength={6}
          secureTextEntry
          value={confirmNewPin}
          onChangeText={setConfirmNewPin}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleChangePin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#0e0f0c" />
          ) : (
            <Text style={styles.saveBtnText}>Update Unlock PIN</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 20,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  meta: {
    flex: 1,
    marginRight: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  desc: {
    fontSize: 11,
    color: '#868685',
    marginTop: 2,
    lineHeight: 16,
    fontWeight: '600',
  },
  formSpacer: {
    height: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0e0f0c',
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 4,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
    marginBottom: 10,
  },
  saveBtn: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
});
