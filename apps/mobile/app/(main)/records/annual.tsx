import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Svg, Rect, G, Text as SvgText } from 'react-native-svg';
import { useAuthStore } from '../../../src/store/authStore';
import { getAllRecords } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { formatINR } from '../../../src/utils/calculations';
import type { IncomeEntry, ExpenseEntry } from '@kutumbkosh/shared';

const YEARS = [2025, 2026, 2027, 2028];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AnnualSummaryScreen() {
  const { cryptoKey } = useAuthStore();
  const [selectedYear, setSelectedYear] = useState(2026);
  const [loading, setLoading] = useState(false);

  // Yearly aggregates
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [monthsData, setMonthsData] = useState<Array<{
    monthName: string;
    income: number;
    expense: number;
  }>>([]);

  useEffect(() => {
    loadAnnualData();
  }, [selectedYear]);

  const loadAnnualData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);

      // Filter by selected year
      const yearIncomes = incomes.filter(i => new Date(i.date).getFullYear() === selectedYear);
      const yearExpenses = expenses.filter(e => new Date(e.date).getFullYear() === selectedYear);

      const yrIncomeSum = yearIncomes.reduce((sum, i) => sum + i.amount, 0);
      const yrExpenseSum = yearExpenses.reduce((sum, e) => sum + e.amount, 0);

      setTotalIncome(yrIncomeSum);
      setTotalExpense(yrExpenseSum);

      // Group by Month (0 to 11)
      const data = Array.from({ length: 12 }, (_, monthIdx) => {
        const monthName = new Date(selectedYear, monthIdx, 1).toLocaleDateString('en-IN', { month: 'short' });
        
        const mIncome = yearIncomes
          .filter(i => new Date(i.date).getMonth() === monthIdx)
          .reduce((sum, i) => sum + i.amount, 0);

        const mExpense = yearExpenses
          .filter(e => new Date(e.date).getMonth() === monthIdx)
          .reduce((sum, e) => sum + e.amount, 0);

        return {
          monthName,
          income: mIncome,
          expense: mExpense,
        };
      });

      setMonthsData(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to calculate annual report data');
    } finally {
      setLoading(false);
    }
  };

  const renderYearlyBarChart = () => {
    if (monthsData.length === 0) return null;
    const height = 140;
    const padding = 15;
    const chartWidth = SCREEN_WIDTH - 64;
    const maxVal = Math.max(...monthsData.map(t => Math.max(t.income, t.expense, 5000)));

    const colWidth = (chartWidth - padding * 2) / 12;

    return (
      <Svg height={height + 25} width={chartWidth}>
        {monthsData.map((t, idx) => {
          const x = padding + idx * colWidth;
          const incHeight = (t.income / maxVal) * height;
          const expHeight = (t.expense / maxVal) * height;

          return (
            <G key={t.monthName}>
              {/* Income bar (green) */}
              {t.income > 0 && (
                <Rect
                  x={x + 1}
                  y={height - incHeight}
                  width={colWidth / 2 - 2}
                  height={incHeight}
                  fill="#9fe870"
                  rx={2}
                />
              )}
              {/* Expense bar (yellow) */}
              {t.expense > 0 && (
                <Rect
                  x={x + colWidth / 2}
                  y={height - expHeight}
                  width={colWidth / 2 - 2}
                  height={expHeight}
                  fill="#ffd11a"
                  rx={2}
                />
              )}
              <SvgText
                x={x + colWidth / 2}
                y={height + 15}
                fill="#868685"
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
              >
                {t.monthName}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  };

  const netSavings = totalIncome - totalExpense;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Annual Summary</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Year selector */}
      <View style={styles.yearRow}>
        {YEARS.map((yr) => (
          <TouchableOpacity
            key={yr}
            style={[styles.yearChip, selectedYear === yr && styles.yearChipActive]}
            onPress={() => setSelectedYear(yr)}
          >
            <Text style={[styles.yearText, selectedYear === yr && styles.yearTextActive]}>
              {yr}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : (
        <View>
          {/* Summary metrics */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Yearly Statistics ({selectedYear})</Text>
            
            <View style={styles.metricRow}>
              <View>
                <Text style={styles.metricLabel}>Total Income</Text>
                <AmountDisplay amount={totalIncome} color="#2ead4b" size={18} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.metricLabel}>Total Expenses</Text>
                <AmountDisplay amount={totalExpense} color="#d03238" size={18} />
              </View>
            </View>

            <View style={styles.netSavingsRow}>
              <Text style={styles.savingsLabel}>Annual Net Savings</Text>
              <AmountDisplay 
                amount={netSavings} 
                color={netSavings >= 0 ? '#2ead4b' : '#d03238'} 
                size={20} 
              />
            </View>
          </View>

          {/* Svg Chart Card */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Monthly Comparison</Text>
            {renderYearlyBarChart()}
          </View>

          {/* Month list */}
          <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCol, styles.tableColHeader, { flex: 1.2 }]}>Month</Text>
              <Text style={[styles.tableCol, styles.tableColHeader, { textAlign: 'right' }]}>Income</Text>
              <Text style={[styles.tableCol, styles.tableColHeader, { textAlign: 'right' }]}>Expense</Text>
            </View>
            {monthsData.map((item) => (
              <View key={item.monthName} style={styles.tableRow}>
                <Text style={[styles.tableCol, styles.monthLabel, { flex: 1.2 }]}>{item.monthName}</Text>
                <Text style={[styles.tableCol, { color: '#2ead4b', textAlign: 'right' }]}>
                  {item.income > 0 ? formatINR(item.income) : '—'}
                </Text>
                <Text style={[styles.tableCol, { color: '#d03238', textAlign: 'right' }]}>
                  {item.expense > 0 ? formatINR(item.expense) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
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
    fontSize: 22,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  yearChip: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  yearChipActive: {
    backgroundColor: '#9fe870',
  },
  yearText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#454745',
  },
  yearTextActive: {
    color: '#0e0f0c',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 8,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  netSavingsRow: {
    borderTopWidth: 1,
    borderTopColor: '#e8ebe6',
    paddingTop: 12,
    alignItems: 'center',
  },
  savingsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 12,
  },
  table: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    overflow: 'hidden',
    marginBottom: 40,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e8ebe6',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0e0f0c',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
  },
  tableCol: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#454745',
    textTransform: 'uppercase',
  },
  monthLabel: {
    color: '#0e0f0c',
  },
});
