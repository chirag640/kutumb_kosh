import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Switch, 
  ActivityIndicator,
  Modal,
  Platform
} from 'react-native';
import { showAlert } from '../../../src/utils/alert';
const Alert = { alert: showAlert };
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from '../../../src/utils/secureStore';
import * as LocalAuthentication from 'expo-local-authentication';
import { Buffer } from 'buffer';
import { useAuthStore } from '../../../src/store/authStore';
import { getOrCreateSalt, deriveKey, encrypt } from '../../../src/crypto';
import { useIsMounted } from '../../../src/hooks/useIsMounted';

export default function SecuritySettingsScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [hasHardware, setHasHardware] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(0);
  const isMounted = useIsMounted();

  // Form states
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  // Reveal master password states
  const [revealModalVisible, setRevealModalVisible] = useState(false);
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  useEffect(() => {
    checkBiometrics();
    loadLockTimeout();
  }, []);

  const loadLockTimeout = async () => {
    const val = await SecureStore.getItemAsync('kk_lock_timeout') ?? '0';
    if (!isMounted()) return;
    setLockTimeout(parseInt(val, 10));
  };

  const handleSelectTimeout = async (timeoutMs: number) => {
    setLockTimeout(timeoutMs);
    await SecureStore.setItemAsync('kk_lock_timeout', String(timeoutMs));
    Alert.alert('Success', 'Lock timeout updated successfully.');
  };

  const checkBiometrics = async () => {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isMounted()) return;
    setHasHardware(hardware && enrolled);
    
    // Check if biometric key is active in SecureStore
    const bioKey = await SecureStore.getItemAsync('kk_master_key_biometric');
    if (!isMounted()) return;
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

        if (!isMounted()) return;
        if (auth.success) {
          // Store the derived master key in biometric-protected SecureStore
          const masterKeyHex = Buffer.from(cryptoKey).toString('hex');
          await SecureStore.setItemAsync('kk_master_key_biometric', masterKeyHex, {
            requireAuthentication: true,
          });
          if (isMounted()) {
            setBiometricsEnabled(true);
            Alert.alert('Success', 'Biometric unlock enabled successfully.');
          }
        } else {
          setBiometricsEnabled(false);
        }
      } else {
        // Delete biometric key
        await SecureStore.deleteItemAsync('kk_master_key_biometric');
        if (isMounted()) {
          setBiometricsEnabled(false);
          Alert.alert('Disabled', 'Biometric unlock disabled.');
        }
      }
    } catch (err) {
      if (!isMounted()) return;
      Alert.alert('Error', 'Failed to configure biometrics.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
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

      if (!isMounted()) return;
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

      if (isMounted()) {
        Alert.alert('Success', 'Unlock PIN updated successfully.');
        setOldPin('');
        setNewPin('');
        setConfirmNewPin('');
      }
    } catch (err) {
      if (!isMounted()) return;
      Alert.alert('Error', 'Failed to update PIN.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  const handleRevealPress = async () => {
    // Attempt biometric authentication if enrolled
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!isMounted()) return;
    if (hardware && enrolled) {
      try {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to Reveal Master Password',
        });
        
        if (!isMounted()) return;
        if (auth.success) {
          const pass = await SecureStore.getItemAsync('kk_master_password');
          if (!isMounted()) return;
          if (pass) {
            setRevealedPassword(pass);
            return;
          } else {
            Alert.alert('Error', 'Master password not found on this device.');
          }
        }
      } catch (err) {
        console.error('Biometric authentication failed:', err);
      }
    }
    
    // Fall back to PIN verification modal
    if (isMounted()) {
      setPinConfirmInput('');
      setRevealModalVisible(true);
    }
  };

  const handleVerifyPinAndReveal = async () => {
    if (pinConfirmInput.length !== 6 || !/^\d+$/.test(pinConfirmInput)) {
      Alert.alert('Invalid PIN', 'PIN must be exactly 6 digits.');
      return;
    }
    
    try {
      const storedPin = await SecureStore.getItemAsync('kk_pin');
      if (!isMounted()) return;
      if (pinConfirmInput === storedPin) {
        const pass = await SecureStore.getItemAsync('kk_master_password');
        if (!isMounted()) return;
        if (pass) {
          setRevealedPassword(pass);
          setRevealModalVisible(false);
          setPinConfirmInput('');
        } else {
          Alert.alert('Error', 'Master password not found on this device.');
        }
      } else {
        Alert.alert('Incorrect PIN', 'The unlock PIN you entered is incorrect.');
      }
    } catch (err) {
      if (!isMounted()) return;
      Alert.alert('Error', 'Failed to verify PIN.');
    }
  };

  const handleCopyPassword = async () => {
    if (revealedPassword) {
      await Clipboard.setStringAsync(revealedPassword);
      Alert.alert('Copied', 'Master password copied to clipboard.');
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

      {/* Lock Timeout Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Auto-Lock Timeout</Text>
        <Text style={styles.desc}>Choose how long the app can stay in the background before requiring your PIN again.</Text>
        
        <View style={styles.timeoutGrid}>
          {[
            { label: 'Immediate', value: 0 },
            { label: '1 Min', value: 60000 },
            { label: '3 Min', value: 180000 },
            { label: '5 Min', value: 300000 },
            { label: '10 Min', value: 600000 },
            { label: 'Never', value: -1 },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.timeoutBtn,
                lockTimeout === opt.value && styles.timeoutBtnActive
              ]}
              onPress={() => handleSelectTimeout(opt.value)}
            >
              <Text style={[
                styles.timeoutBtnText,
                lockTimeout === opt.value && styles.timeoutBtnTextActive
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Reveal Master Password Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zero-Knowledge Backup</Text>
        <Text style={styles.desc}>
          Because KutumbKosh is zero-knowledge, the server cannot recover your password. Use this tool to reveal and write down your master password safely.
        </Text>
        
        {revealedPassword ? (
          <View style={styles.revealedContainer}>
            <Text style={styles.revealedLabel}>Your Master Password:</Text>
            <Text style={styles.revealedPass}>{revealedPassword}</Text>
            <View style={styles.revealedActions}>
              <TouchableOpacity style={styles.revealedBtn} onPress={handleCopyPassword}>
                <Ionicons name="copy-outline" size={16} color="#0e0f0c" style={{ marginRight: 4 }} />
                <Text style={styles.revealedBtnText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.revealedBtn, { borderColor: '#d03238' }]} onPress={() => setRevealedPassword(null)}>
                <Ionicons name="eye-off-outline" size={16} color="#d03238" style={{ marginRight: 4 }} />
                <Text style={[styles.revealedBtnText, { color: '#d03238' }]}>Hide</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.revealBtn} onPress={handleRevealPress}>
            <Ionicons name="eye" size={20} color="#0e0f0c" style={{ marginRight: 8 }} />
            <Text style={styles.revealBtnText}>Reveal Master Password</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PIN Verification Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={revealModalVisible}
        onRequestClose={() => setRevealModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm security PIN</Text>
            <Text style={styles.modalSub}>Enter your 6-digit Unlock PIN to reveal the master password:</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="••••••"
              placeholderTextColor="#868685"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              value={pinConfirmInput}
              onChangeText={setPinConfirmInput}
              autoFocus
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, { borderColor: '#868685' }]} 
                onPress={() => {
                  setRevealModalVisible(false);
                  setPinConfirmInput('');
                }}
              >
                <Text style={[styles.modalBtnText, { color: '#868685' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: '#9fe870', borderColor: '#0e0f0c' }]} 
                onPress={handleVerifyPinAndReveal}
              >
                <Text style={[styles.modalBtnText, { color: '#0e0f0c' }]}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  timeoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  timeoutBtn: {
    flex: 1,
    flexBasis: '30%',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginBottom: 4,
  },
  timeoutBtnActive: {
    backgroundColor: '#9fe870',
  },
  timeoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  timeoutBtnTextActive: {
    color: '#0e0f0c',
  },
  revealedContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#e8ebe6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0e0f0c',
    alignItems: 'center',
    width: '100%',
  },
  revealedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  revealedPass: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0e0f0c',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    width: '100%',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e8ebe6',
  },
  revealedActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  revealedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
  },
  revealedBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  revealBtn: {
    flexDirection: 'row',
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
  },
  revealBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 20,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 12,
    color: '#868685',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 6,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
    width: '100%',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
