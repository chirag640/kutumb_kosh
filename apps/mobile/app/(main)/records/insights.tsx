import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/store/authStore';
import { getAllRecords } from '../../../src/db/crud';
import { db } from '../../../src/db';
import { formatINR } from '../../../src/utils/calculations';
import { Theme } from '../../../src/constants/theme';
import type { ExpenseEntry } from '@kutumbkosh/shared';

export default function SpendingInsightsScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState(25000);
  const [totalSpent, setTotalSpent] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Array<{
    category: string;
    amount: number;
    pctOfTotal: number;
    pctOfBudget: number;
    isOverLimit: boolean;
  }>>([]);

  useFocusEffect(
    useCallback(() => {
      loadInsights();
    }, [cryptoKey])
  );

  const loadInsights = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      // 1. Load budget limit
      const budgetRow = db.getFirstSync('SELECT value FROM app_settings WHERE key = ?', ['monthly_budget_limit']) as { value: string } | null;
      const budget = budgetRow ? Number(budgetRow.value) : 25000;
      setBudgetLimit(budget);

      // 2. Load current month's expenses (filtered at SQLite level for optimal decryption performance)
      const currentMonthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      const currentMonthExpenses = await getAllRecords<ExpenseEntry>(
        'expense_entries',
        cryptoKey,
        ' AND entry_date LIKE ?',
        [`${currentMonthKey}%`]
      );

      let total = 0;
      const categoryMap: Record<string, number> = {};

      currentMonthExpenses.forEach(exp => {
        total += exp.amount;
        categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
      });

      setTotalSpent(total);

      // 3. Map breakdown
      const breakdown = Object.entries(categoryMap).map(([category, amount]) => {
        const pctOfTotal = total > 0 ? (amount / total) * 100 : 0;
        const pctOfBudget = budget > 0 ? (amount / budget) * 100 : 0;
        // Flag if a category takes up more than 40% of the total month's spending
        const isOverLimit = pctOfTotal > 40;

        return {
          category,
          amount,
          pctOfTotal,
          pctOfBudget,
          isOverLimit,
        };
      }).sort((a, b) => b.amount - a.amount);

      setCategoryBreakdown(breakdown);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to calculate spending insights');
    } finally {
      setLoading(false);
    }
  };

  const budgetProgress = budgetLimit > 0 ? (totalSpent / budgetLimit) * 100 : 0;
  const isBudgetExceeded = totalSpent > budgetLimit;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Spending Insights</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Monthly Budget Tracker Card */}
          <View style={[styles.card, isBudgetExceeded && styles.cardExceeded]}>
            <Text style={styles.cardLabel}>Monthly Budget Limit</Text>
            <View style={styles.budgetValRow}>
              <Text style={styles.budgetValue}>{formatINR(totalSpent)}</Text>
              <Text style={styles.budgetLimitText}>/ {formatINR(budgetLimit)}</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${Math.min(budgetProgress, 100)}%`,
                    backgroundColor: isBudgetExceeded ? '#d03238' : '#2ead4b'
                  }
                ]} 
              />
            </View>

            <Text style={styles.progressPctText}>
              {budgetProgress.toFixed(0)}% of monthly budget consumed
            </Text>
          </View>

          {/* Alerts Banner */}
          {categoryBreakdown.some(c => c.isOverLimit) && (
            <View style={styles.alertBanner}>
              <Ionicons name="warning" size={20} color="#c2410c" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>Concentration Warning</Text>
                <Text style={styles.alertDesc}>
                  One or more spending categories exceed 40% of this month's total spend. Consider scaling back.
                </Text>
              </View>
            </View>
          )}

          {/* Categories Breakdown */}
          <Text style={styles.sectionTitle}>Category Breakdown</Text>
          {categoryBreakdown.length === 0 ? (
            <View style={styles.emptyBreakdown}>
              <Ionicons name="pie-chart-outline" size={48} color="#868685" />
              <Text style={styles.emptyText}>No expenses logged this month</Text>
            </View>
          ) : (
            categoryBreakdown.map((item) => (
              <View key={item.category} style={styles.categoryRow}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryLeft}>
                    <Text style={styles.categoryName}>
                      {item.category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                    {item.isOverLimit && (
                      <View style={styles.warnBadge}>
                        <Text style={styles.warnBadgeText}>&gt;40%</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.categoryAmount}>{formatINR(item.amount)}</Text>
                </View>

                {/* Progress Slices */}
                <View style={styles.categoryProgressRow}>
                  <View style={styles.categoryBarBg}>
                    <View 
                      style={[
                        styles.categoryBarFill, 
                        { 
                          width: `${Math.min(item.pctOfTotal, 100)}%`,
                          backgroundColor: item.isOverLimit ? '#d03238' : '#0284c7'
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.categoryPct}>{item.pctOfTotal.toFixed(0)}% of total</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 20,
    marginBottom: 20,
  },
  cardExceeded: {
    borderColor: '#d03238',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#868685',
    textTransform: 'uppercase',
  },
  budgetValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 6,
  },
  budgetValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  budgetLimitText: {
    fontSize: 14,
    color: '#868685',
    fontWeight: '700',
    marginLeft: 6,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#f6f8f5',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e8ebe6',
    overflow: 'hidden',
    marginTop: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#868685',
    marginTop: 8,
  },
  alertBanner: {
    backgroundColor: '#ffedd5',
    borderColor: '#c2410c',
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#c2410c',
  },
  alertDesc: {
    fontSize: 11,
    color: '#7c2d12',
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 16,
  },
  emptyBreakdown: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#868685',
    fontWeight: '700',
    marginTop: 12,
  },
  categoryRow: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  warnBadge: {
    backgroundColor: '#fed7aa',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warnBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#c2410c',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  categoryProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#f6f8f5',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 12,
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryPct: {
    fontSize: 10,
    fontWeight: '700',
    color: '#868685',
  },
});
