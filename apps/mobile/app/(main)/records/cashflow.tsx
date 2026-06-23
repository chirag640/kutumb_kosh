import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { getAllRecords } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { formatINR } from '../../../src/utils/calculations';
import type { IncomeEntry, ExpenseEntry } from '@kutumbkosh/shared';

export default function CashFlowScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [monthlyData, setMonthlyData] = useState<Array<{
    monthKey: string;
    monthLabel: string;
    income: number;
    expense: number;
    savings: number;
    savingsPct: number;
  }>>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);

      // Group by Month Key (YYYY-MM)
      const groups: { [key: string]: { income: number; expense: number } } = {};

      incomes.forEach((inc) => {
        const key = inc.date.slice(0, 7); // YYYY-MM
        if (!groups[key]) groups[key] = { income: 0, expense: 0 };
        groups[key].income += inc.amount;
      });

      expenses.forEach((exp) => {
        const key = exp.date.slice(0, 7); // YYYY-MM
        if (!groups[key]) groups[key] = { income: 0, expense: 0 };
        groups[key].expense += exp.amount;
      });

      const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a)); // Descending

      const result = sortedKeys.map((key) => {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        const label = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        
        const income = groups[key].income;
        const expense = groups[key].expense;
        const savings = income - expense;
        const savingsPct = income > 0 ? Math.round((savings / income) * 100) : 0;

        return {
          monthKey: key,
          monthLabel: label,
          income,
          expense,
          savings,
          savingsPct,
        };
      });

      setMonthlyData(result);
    } catch (err) {
      Alert.alert('Error', 'Failed to calculate cash flow reports');
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
        <Text style={styles.title}>Cash Flow Summary</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : monthlyData.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bar-chart-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Transactions Logged</Text>
          <Text style={styles.emptySubtitle}>Log incomes and expenses to see your family cash flow reports.</Text>
        </View>
      ) : (
        <FlatList
          data={monthlyData}
          keyExtractor={(item) => item.monthKey}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.monthName}>{item.monthLabel}</Text>
              
              <View style={styles.row}>
                <Text style={styles.label}>Total Income</Text>
                <AmountDisplay amount={item.income} color="#2ead4b" size={15} />
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Total Expenses</Text>
                <AmountDisplay amount={item.expense} color="#d03238" size={15} />
              </View>

              <View style={[styles.row, styles.savingsRow]}>
                <Text style={styles.savingsLabel}>Net Savings ({item.savingsPct}%)</Text>
                <AmountDisplay 
                  amount={item.savings} 
                  color={item.savings >= 0 ? '#2ead4b' : '#d03238'} 
                  size={16} 
                />
              </View>
            </View>
          )}
        />
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
    fontSize: 22,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0e0f0c',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#454745',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 16,
  },
  monthName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0e0f0c',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#454745',
  },
  savingsRow: {
    borderTopWidth: 1,
    borderTopColor: '#e8ebe6',
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 0,
  },
  savingsLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
});
