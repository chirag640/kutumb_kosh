import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Buffer } from 'buffer';
import { useAuthStore } from '../../../src/store/authStore';
import { 
  getAllRecords, 
  getRawTableRecords, 
  restoreRawRecord, 
  hasRecord, 
  clearTable 
} from '../../../src/db/crud';
import { 
  getOrCreateSalt, 
  deriveKey, 
  decryptRecord, 
  encryptRecord 
} from '../../../src/crypto';
import { formatINR } from '../../../src/utils/calculations';
import type { IncomeEntry, ExpenseEntry, BankAccount, Loan } from '@kutumbkosh/shared';
import { useIsMounted } from '../../../src/hooks/useIsMounted';

const BACKUP_TABLES = [
  'family_members',
  'income_entries',
  'expense_entries',
  'bank_accounts',
  'lic_policies',
  'insurance_policies',
  'loans',
  'documents',
  'fdrd_entries',
  'property',
  'savings_goals'
];

export default function ExportSettingsScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Processing...');
  const isMounted = useIsMounted();

  // Restore states
  const [backupData, setBackupData] = useState<any>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [showRestoreModeModal, setShowRestoreModeModal] = useState(false);
  const [pendingBackupKey, setPendingBackupKey] = useState<any>(null);

  // ─── Export Excel / PDF ──────────────────────────────────────────────────────

  const handleExportExcel = async () => {
    if (!cryptoKey) return;
    setLoadingText('Compiling Excel sheets...');
    setLoading(true);

    try {
      // Dynamically import SheetJS on demand
      const XLSX = await import('xlsx');
      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);
      const banks = await getAllRecords<BankAccount>('bank_accounts', cryptoKey);
      const loans = await getAllRecords<Loan>('loans', cryptoKey);

      if (!isMounted()) return;

      const incomeSheetData = incomes.map(i => ({
        Date: i.date,
        Source: i.source,
        Amount: i.amount,
        Notes: i.notes || '',
        Recurring: i.isRecurring ? 'Yes' : 'No'
      }));

      const expenseSheetData = expenses.map(e => ({
        Date: e.date,
        Category: e.category,
        Subcategory: e.subcategory,
        Amount: e.amount,
        PaymentMethod: e.paymentMethod,
        Notes: e.notes || '',
        Recurring: e.isRecurring ? 'Yes' : 'No'
      }));

      const bankSheetData = banks.map(b => ({
        Bank: b.bankName,
        Type: b.accountType,
        AccountNumber: b.accountNumber,
        Balance: b.balance
      }));

      const loanSheetData = loans.map(l => ({
        Lender: l.lender,
        Type: l.loanType,
        OriginalAmount: l.originalAmount,
        OutstandingAmount: l.outstandingAmount,
        EMI: l.emi,
        InterestRate: `${l.interestRate}%`
      }));

      const wb = XLSX.utils.book_new();
      
      const wsIncome = XLSX.utils.json_to_sheet(incomeSheetData);
      XLSX.utils.book_append_sheet(wb, wsIncome, "Income");

      const wsExpense = XLSX.utils.json_to_sheet(expenseSheetData);
      XLSX.utils.book_append_sheet(wb, wsExpense, "Expenses");

      const wsBank = XLSX.utils.json_to_sheet(bankSheetData);
      XLSX.utils.book_append_sheet(wb, wsBank, "Banks");

      const wsLoan = XLSX.utils.json_to_sheet(loanSheetData);
      XLSX.utils.book_append_sheet(wb, wsLoan, "Loans");

      if (Platform.OS === 'web') {
        XLSX.writeFile(wb, 'KutumbKosh_Financial_Backup.xlsx');
        return;
      }

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = FileSystem.documentDirectory + 'KutumbKosh_Financial_Backup.xlsx';
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri);
    } catch (err) {
      console.error(err);
      if (!isMounted()) return;
      Alert.alert('Export Failed', 'An error occurred while compiling your Excel sheets.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  const handleExportPDF = async () => {
    if (!cryptoKey) return;
    setLoadingText('Generating PDF report...');
    setLoading(true);

    try {
      // @ts-ignore
      const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');

      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);
      
      if (!isMounted()) return;

      const netSavings = incomes.reduce((s, i) => s + i.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0);

      const doc = new jsPDF();
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(24);
      doc.setTextColor(14, 15, 12);
      doc.text("KutumbKosh", 14, 20);
      
      doc.setFontSize(12);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(134, 134, 133);
      doc.text("Family Treasury Financial Report", 14, 26);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 32);

      doc.setDrawColor(14, 15, 12);
      doc.setLineWidth(0.5);
      doc.line(14, 36, 196, 36);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(14, 15, 12);
      doc.text("Financial Summary", 14, 46);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(12);
      doc.text(`Total Logged Income: ${formatINR(incomes.reduce((s, i) => s + i.amount, 0))}`, 14, 54);
      doc.text(`Total Logged Expenses: ${formatINR(expenses.reduce((s, e) => s + e.amount, 0))}`, 14, 62);
      doc.text(`Net Cumulative Savings: ${formatINR(netSavings)}`, 14, 70);

      doc.line(14, 76, 196, 76);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Recent Income Entries", 14, 86);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      let y = 94;
      incomes.slice(0, 10).forEach((inc, idx) => {
        doc.text(`${idx + 1}. ${inc.date} | ${inc.source} | ${formatINR(inc.amount)}`, 14, y);
        y += 8;
      });

      doc.line(14, y + 2, 196, y + 2);
      y += 12;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Recent Expense Entries", 14, y);
      y += 8;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      expenses.slice(0, 10).forEach((exp, idx) => {
        doc.text(`${idx + 1}. ${exp.date} | ${exp.category} (${exp.subcategory}) | ${formatINR(exp.amount)}`, 14, y);
        y += 8;
      });

      doc.setFontSize(9);
      doc.setTextColor(134, 134, 133);
      doc.text("Report secured via KutumbKosh client-side AES-256 encryption.", 14, 280);

      if (Platform.OS === 'web') {
        doc.save('KutumbKosh_Financial_Report.pdf');
        return;
      }

      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const fileUri = FileSystem.documentDirectory + 'KutumbKosh_Financial_Report.pdf';
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri);
    } catch (err) {
      console.error(err);
      if (!isMounted()) return;
      Alert.alert('Export Failed', 'An error occurred while compiling your PDF report.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  // ─── Encrypted Backup Creation ──────────────────────────────────────────────

  const handleCreateBackup = async () => {
    setLoadingText('Compiling secure backup...');
    setLoading(true);

    try {
      const saltBytes = await getOrCreateSalt();
      if (!isMounted()) return;
      const saltHex = Buffer.from(saltBytes).toString('hex');

      const backupTables: Record<string, any[]> = {};
      for (const table of BACKUP_TABLES) {
        backupTables[table] = getRawTableRecords(table);
      }

      const backupObj = {
        backupVersion: '1.0.0',
        salt: saltHex,
        timestamp: new Date().toISOString(),
        tables: backupTables
      };

      const backupContent = JSON.stringify(backupObj, null, 2);

      if (Platform.OS === 'web') {
        triggerWebFileDownload(backupContent, 'KutumbKosh_Encrypted_Backup.kkbackup');
        return;
      }

      const fileUri = FileSystem.documentDirectory + 'KutumbKosh_Encrypted_Backup.kkbackup';
      await FileSystem.writeAsStringAsync(fileUri, backupContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri);
    } catch (err) {
      console.error(err);
      if (!isMounted()) return;
      Alert.alert('Backup Failed', 'An error occurred while packaging your encrypted database.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  const triggerWebFileDownload = (content: string, filename: string) => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Encrypted Backup Restore ──────────────────────────────────────────────

  const handleRestoreBackup = async () => {
    try {
      let fileContent = '';

      if (Platform.OS === 'web') {
        fileContent = await triggerWebFilePicker();
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true
        });

        if (!isMounted()) return;
        if (result.canceled || !result.assets || result.assets.length === 0) {
          return;
        }

        const uri = result.assets[0].uri;
        fileContent = await FileSystem.readAsStringAsync(uri);
      }

      if (!isMounted()) return;
      const parsed = JSON.parse(fileContent);
      if (!parsed.backupVersion || !parsed.salt || !parsed.tables) {
        throw new Error('Invalid backup format');
      }

      setBackupData(parsed);

      // Verify salt alignment
      const currentSaltBytes = await getOrCreateSalt();
      if (!isMounted()) return;
      const currentSaltHex = Buffer.from(currentSaltBytes).toString('hex');

      if (parsed.salt === currentSaltHex) {
        // salts match — key is identical, direct import
        setPendingBackupKey(null);
        setShowRestoreModeModal(true);
      } else {
        // salts differ — require backup's password to decrypt
        setBackupPassword('');
        setShowPasswordModal(true);
      }
    } catch (err) {
      if (!isMounted()) return;
      Alert.alert('Restore Failed', 'Selected file is not a valid KutumbKosh backup file.');
    }
  };

  const triggerWebFilePicker = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kkbackup,.json';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (!file) return reject(new Error('No file selected'));
        const reader = new FileReader();
        reader.onload = (event: any) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsText(file);
      };
      input.click();
    });
  };

  const handleDecryptBackup = async () => {
    if (!backupPassword.trim()) {
      Alert.alert('Password Required', 'Please enter the master password used for the backup.');
      return;
    }

    setLoadingText('Deriving decryption key...');
    setShowPasswordModal(false);
    setLoading(true);

    try {
      const backupSaltBytes = Buffer.from(backupData.salt, 'hex');
      const backupKey = await deriveKey(backupPassword, backupSaltBytes);

      if (!isMounted()) return;

      // Attempt verification decrypting first record
      let verified = false;
      for (const table of Object.keys(backupData.tables)) {
        const records = backupData.tables[table];
        if (records && records.length > 0) {
          try {
            const first = records[0];
            await decryptRecord(backupKey, { iv: first.iv, data: first.data });
            verified = true;
            break;
          } catch {
            // decryption failed (wrong password)
            break;
          }
        }
      }

      // If all tables are empty, any password derived key is fine
      if (!verified && Object.values(backupData.tables).every((arr: any) => arr.length === 0)) {
        verified = true;
      }

      if (!isMounted()) return;
      if (!verified) {
        Alert.alert('Decryption Failed', 'The master password entered was incorrect.');
        setLoading(false);
        return;
      }

      setPendingBackupKey(backupKey);
      setShowRestoreModeModal(true);
    } catch (e) {
      if (!isMounted()) return;
      Alert.alert('Error', 'An error occurred during key derivation.');
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  };

  const handleExecuteRestore = async (mode: 'merge' | 'overwrite') => {
    setShowRestoreModeModal(false);
    setLoadingText(mode === 'overwrite' ? 'Overwriting database...' : 'Merging records...');
    setLoading(true);

    try {
      const activeKey = cryptoKey!;
      const tablesToRestore = Object.keys(backupData.tables);

      if (mode === 'overwrite') {
        for (const table of tablesToRestore) {
          clearTable(table);
        }
      }

      let restoredCount = 0;
      let skippedCount = 0;

      for (const table of tablesToRestore) {
        const records = backupData.tables[table];
        if (!records || records.length === 0) continue;

        for (const rawRow of records) {
          if (mode === 'merge' && hasRecord(table, rawRow.local_id)) {
            skippedCount++;
            continue;
          }

          let rowToInsert = { ...rawRow };
          
          if (pendingBackupKey !== null) {
            try {
              const decryptedPayload = await decryptRecord<any>(pendingBackupKey, { iv: rawRow.iv, data: rawRow.data });
              const reEncryptedBlob = await encryptRecord(activeKey, decryptedPayload);
              rowToInsert.iv = reEncryptedBlob.iv;
              rowToInsert.data = reEncryptedBlob.data;
            } catch (e) {
              console.warn(`Failed to re-encrypt record ${rawRow.local_id} in table ${table}`);
              continue;
            }
          }

          rowToInsert.sync_status = 'pending';
          restoreRawRecord(table, rowToInsert);
          restoredCount++;
        }
      }

      if (!isMounted()) return;

      // Trigger sync
      import('../../../src/sync/engine').then(({ performSync }) => {
        performSync('manual').catch(() => {});
      });

      Alert.alert(
        'Restore Complete',
        `Successfully restored ${restoredCount} records.${mode === 'merge' ? ` Skipped ${skippedCount} duplicates.` : ''}`
      );
    } catch (err) {
      console.error(err);
      if (!isMounted()) return;
      Alert.alert('Restore Error', 'An error occurred while inserting backup records.');
    } finally {
      if (isMounted()) {
        setLoading(false);
        setBackupData(null);
        setPendingBackupKey(null);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Backup & Export</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Encrypted Backups */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Encrypted Local Backups</Text>
          <Text style={styles.desc}>
            Back up all your encrypted family vaults. Securely restore them on this device or import them onto a new device.
          </Text>

          <TouchableOpacity 
            style={[styles.exportBtn, loading && styles.disabledBtn]} 
            onPress={handleCreateBackup}
            disabled={loading}
          >
            <Ionicons name="shield-checkmark-outline" size={24} color="#0070f3" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.btnLabel}>Create Encrypted Backup</Text>
              <Text style={styles.btnDesc}>Generates a secure .kkbackup file containing all encrypted tables.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.exportBtn, loading && styles.disabledBtn]} 
            onPress={handleRestoreBackup}
            disabled={loading}
          >
            <Ionicons name="cloud-upload-outline" size={24} color="#166534" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.btnLabel}>Restore from Backup</Text>
              <Text style={styles.btnDesc}>Import and decrypt a previously saved .kkbackup file.</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Regular Export Formats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export Unencrypted Formats</Text>
          <Text style={styles.desc}>
            Select your export format. Your data is compiled locally into standard Excel sheets or PDF documents for external use.
          </Text>

          <TouchableOpacity 
            style={[styles.exportBtn, loading && styles.disabledBtn]} 
            onPress={handleExportExcel}
            disabled={loading}
          >
            <Ionicons name="document-text-outline" size={24} color="#0e0f0c" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.btnLabel}>Export to Excel (.xlsx)</Text>
              <Text style={styles.btnDesc}>Generates separate sheets for income, expenses, banks, and loans.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.exportBtn, loading && styles.disabledBtn]} 
            onPress={handleExportPDF}
            disabled={loading}
          >
            <Ionicons name="print-outline" size={24} color="#0e0f0c" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.btnLabel}>Export PDF Report (.pdf)</Text>
              <Text style={styles.btnDesc}>Generates a printable summary report of recent financials.</Text>
            </View>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0e0f0c" />
            <Text style={styles.loadingText}>{loadingText}</Text>
          </View>
        )}
      </ScrollView>

      {/* PASSWORD PROMPT MODAL (if salts differ) */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="key-outline" size={24} color="#0e0f0c" />
              <Text style={styles.modalTitle}>Enter Password</Text>
            </View>
            <Text style={styles.modalDesc}>
              This backup uses a different encryption configuration. Please enter the master password used to encrypt this backup.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Backup Master Password"
              placeholderTextColor="#868685"
              secureTextEntry
              value={backupPassword}
              onChangeText={setBackupPassword}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => {
                  setShowPasswordModal(false);
                  setBackupData(null);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleDecryptBackup}>
                <Text style={styles.confirmBtnText}>Decrypt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RESTORE MODE MODAL (Merge or Overwrite selection) */}
      <Modal visible={showRestoreModeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="refresh-circle-outline" size={28} color="#0e0f0c" />
              <Text style={styles.modalTitle}>Restore Mode</Text>
            </View>
            <Text style={styles.modalDesc}>
              Choose how you want to restore the backup data into your database:
            </Text>
            
            <TouchableOpacity style={styles.modeOption} onPress={() => handleExecuteRestore('merge')}>
              <Ionicons name="git-merge-outline" size={22} color="#0070f3" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Merge Backup Data</Text>
                <Text style={styles.modeDesc}>Adds new records without affecting or duplicating your current local entries.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modeOption} onPress={() => handleExecuteRestore('overwrite')}>
              <Ionicons name="trash-outline" size={22} color="#d32f2f" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: '#d32f2f' }]}>Wipe & Overwrite</Text>
                <Text style={styles.modeDesc}>Deletes all current local records and replaces them completely with backup entries.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.cancelBtn, { marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }]} 
              onPress={() => {
                setShowRestoreModeModal(false);
                setBackupData(null);
                setPendingBackupKey(null);
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  desc: {
    fontSize: 11,
    color: '#868685',
    lineHeight: 16,
    marginBottom: 20,
    fontWeight: '600',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8ebe6',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  btnLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  btnDesc: {
    fontSize: 11,
    color: '#868685',
    marginTop: 4,
    lineHeight: 16,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#454745',
    fontWeight: '700',
    marginTop: 8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14, 15, 12, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0e0f0c',
    marginLeft: 8,
  },
  modalDesc: {
    fontSize: 12,
    color: '#454745',
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: '#e8ebe6',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0e0f0c',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    marginRight: 10,
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  confirmBtn: {
    backgroundColor: '#0e0f0c',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  // Mode Option
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8ebe6',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  modeDesc: {
    fontSize: 11,
    color: '#868685',
    marginTop: 4,
    lineHeight: 16,
    fontWeight: '600',
  },
});
