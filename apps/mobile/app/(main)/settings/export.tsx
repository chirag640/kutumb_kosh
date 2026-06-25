import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../../../src/store/authStore';
import { getAllRecords } from '../../../src/db/crud';
import { formatINR } from '../../../src/utils/calculations';
import type { IncomeEntry, ExpenseEntry, BankAccount, Loan } from '@kutumbkosh/shared';

export default function ExportSettingsScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const handleExportExcel = async () => {
    if (!cryptoKey) return;
    setLoading(true);

    try {
      // 1. Fetch data
      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);
      const banks = await getAllRecords<BankAccount>('bank_accounts', cryptoKey);
      const loans = await getAllRecords<Loan>('loans', cryptoKey);

      // 2. Format JSON sheets
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
        Last4Digits: b.last4Digits,
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

      // 3. Create Workbook
      const wb = XLSX.utils.book_new();
      
      const wsIncome = XLSX.utils.json_to_sheet(incomeSheetData);
      XLSX.utils.book_append_sheet(wb, wsIncome, "Income");

      const wsExpense = XLSX.utils.json_to_sheet(expenseSheetData);
      XLSX.utils.book_append_sheet(wb, wsExpense, "Expenses");

      const wsBank = XLSX.utils.json_to_sheet(bankSheetData);
      XLSX.utils.book_append_sheet(wb, wsBank, "Banks");

      const wsLoan = XLSX.utils.json_to_sheet(loanSheetData);
      XLSX.utils.book_append_sheet(wb, wsLoan, "Loans");

      // 4. Generate base64
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // 5. Save and Share
      const fileUri = FileSystem.documentDirectory + 'KutumbKosh_Financial_Backup.xlsx';
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri);
    } catch (err) {
      console.error(err);
      Alert.alert('Export Failed', 'An error occurred while compiling your Excel sheets.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!cryptoKey) return;
    setLoading(true);

    try {
      // @ts-ignore
      const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');

      // 1. Fetch data
      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);
      
      const netSavings = incomes.reduce((s, i) => s + i.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0);

      // 2. Construct jsPDF document
      const doc = new jsPDF();
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(24);
      doc.setTextColor(14, 15, 12); // Ink color
      doc.text("KutumbKosh", 14, 20);
      
      doc.setFontSize(12);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(134, 134, 133); // Mute color
      doc.text("Family Treasury Financial Report", 14, 26);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 32);

      // Draw horizontal separator line
      doc.setDrawColor(14, 15, 12);
      doc.setLineWidth(0.5);
      doc.line(14, 36, 196, 36);

      // Key metrics
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

      // Incomes Header
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

      // Expenses Header
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

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(134, 134, 133);
      doc.text("Report secured via KutumbKosh client-side AES-256 encryption.", 14, 280);

      // 3. Generate base64 string
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      // 4. Save and share
      const fileUri = FileSystem.documentDirectory + 'KutumbKosh_Financial_Report.pdf';
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri);
    } catch (err) {
      console.error(err);
      Alert.alert('Export Failed', 'An error occurred while compiling your PDF report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Export Financials</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backup Formats</Text>
        <Text style={styles.desc}>
          Select your backup format. Your data is compiled locally into Excel sheets or PDF documents.
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
          <Text style={styles.loadingText}>Compiling exports...</Text>
        </View>
      )}
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
});
