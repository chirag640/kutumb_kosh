import React from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Switch,
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { useUIStore } from '../../../src/store/uiStore';

export default function SettingsIndexScreen() {
  const { lock, email } = useAuthStore();
  const { 
    privacyMode, 
    togglePrivacy, 
    theme, 
    setTheme, 
    language, 
    setLanguage, 
    simpleMode, 
    setSimpleMode 
  } = useUIStore();

  const handleLockApp = () => {
    Alert.alert('Lock Vault', 'Are you sure you want to lock the app? You will need your PIN or biometrics to unlock.', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Lock App', 
        style: 'destructive',
        onPress: () => {
          lock(); // Clears derived key from memory
          router.replace('/(auth)/lock');
        }
      }
    ]);
  };

  const handleLanguageChange = () => {
    Alert.alert('Select Language', 'Choose your preferred language:', [
      { text: 'English', onPress: () => setLanguage('en') },
      { text: 'ગુજરાતી (Gujarati)', onPress: () => setLanguage('gu') },
      { text: 'हिंदी (Hindi)', onPress: () => setLanguage('hi') },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const handleThemeChange = () => {
    Alert.alert('Select Theme', 'Choose app theme:', [
      { text: 'Light Mode', onPress: () => setTheme('light') },
      { text: 'Dark Mode', onPress: () => setTheme('dark') },
      { text: 'System Default', onPress: () => setTheme('system') },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Vault Settings</Text>
        <Text style={styles.subtitle}>{email || 'Family Account'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security & Database</Text>
        
        <TouchableOpacity style={styles.row} onPress={() => router.push('/settings/security')}>
          <View style={styles.rowLeft}>
            <Ionicons name="lock-closed" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <Text style={styles.rowLabel}>PIN & Biometrics</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#868685" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => router.push('/settings/sync')}>
          <View style={styles.rowLeft}>
            <Ionicons name="sync" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <Text style={styles.rowLabel}>Cloud Backup & Sync</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#868685" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => router.push('/settings/export')}>
          <View style={styles.rowLeft}>
            <Ionicons name="cloud-download" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <Text style={styles.rowLabel}>Export Data (Excel/PDF)</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#868685" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="eye-off" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <View>
              <Text style={styles.rowLabel}>Privacy Mode</Text>
              <Text style={styles.rowDesc}>Masks balances on dashboard and list views</Text>
            </View>
          </View>
          <Switch 
            value={privacyMode} 
            onValueChange={togglePrivacy} 
            trackColor={{ false: '#e8ebe6', true: '#9fe870' }}
            thumbColor={privacyMode ? '#0e0f0c' : '#ffffff'}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="options-outline" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <View>
              <Text style={styles.rowLabel}>Simple Mode</Text>
              <Text style={styles.rowDesc}>Hides advanced modules for ease of use</Text>
            </View>
          </View>
          <Switch 
            value={simpleMode} 
            onValueChange={setSimpleMode} 
            trackColor={{ false: '#e8ebe6', true: '#9fe870' }}
            thumbColor={simpleMode ? '#0e0f0c' : '#ffffff'}
          />
        </View>

        <TouchableOpacity style={styles.row} onPress={handleLanguageChange}>
          <View style={styles.rowLeft}>
            <Ionicons name="language" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <View>
              <Text style={styles.rowLabel}>Language</Text>
              <Text style={styles.rowDesc}>
                {language === 'en' && 'English'}
                {language === 'gu' && 'ગુજરાતી (Gujarati)'}
                {language === 'hi' && 'हिंदी (Hindi)'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#868685" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={handleThemeChange}>
          <View style={styles.rowLeft}>
            <Ionicons name="color-palette" size={20} color="#0e0f0c" style={styles.rowIcon} />
            <View>
              <Text style={styles.rowLabel}>App Theme</Text>
              <Text style={styles.rowDesc}>
                {theme === 'light' && 'Light Mode'}
                {theme === 'dark' && 'Dark Mode'}
                {theme === 'system' && 'System Default'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#868685" />
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />
      
      <TouchableOpacity style={styles.lockBtn} onPress={handleLockApp}>
        <Ionicons name="log-out" size={20} color="#d03238" style={{ marginRight: 8 }} />
        <Text style={styles.lockBtnText}>Lock Vault</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>KutumbKosh v2.0 • Secured Offline-First Storage</Text>
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
    marginTop: 40,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0e0f0c',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: '#868685',
    marginTop: 4,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    overflow: 'hidden',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#868685',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  rowDesc: {
    fontSize: 11,
    color: '#868685',
    marginTop: 2,
    fontWeight: '600',
  },
  lockBtn: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#d03238',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  lockBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#d03238',
  },
  versionText: {
    fontSize: 11,
    color: '#868685',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 40,
  },
  spacer: {
    height: 12,
  },
});
