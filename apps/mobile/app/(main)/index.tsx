import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Svg, Rect, Circle, Line, Path, G, Text as SvgText } from 'react-native-svg';
import { useAuthStore } from '../../src/store/authStore';
import { getAllRecords } from '../../src/db/crud';
import { AmountDisplay } from '../../src/components/AmountDisplay';
import { SyncStatusDot } from '../../src/components/SyncStatusDot';
import { formatINR, calcDaysRemaining } from '../../src/utils/calculations';
import type { 
  IncomeEntry, 
  ExpenseEntry, 
  BankAccount, 
  FDRDEntry, 
  Loan, 
  LICPolicy, 
  InsurancePolicy, 
  FamilyMember,
  ImportantDocument
} from '@kutumbkosh/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DashboardScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activeChartSlide, setActiveChartSlide] = useState(0);

  // Aggregated states
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [netWorth, setNetWorth] = useState(0);
  const [totalLoans, setTotalLoans] = useState(0);
  
  // Alert lists
  const [alerts, setAlerts] = useState<Array<{ id: string; label: string; type: 'red' | 'orange' | 'yellow' | 'blue'; icon: string }>>([]);

  // Data for charts
  const [categoryBreakdown, setCategoryBreakdown] = useState<Array<{ name: string; amount: number; color: string }>>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<Array<{ month: string; income: number; expense: number }>>([]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [cryptoKey])
  );

  const loadDashboardData = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      // 1. Fetch Income
      const incomes = await getAllRecords<IncomeEntry>('income_entries', cryptoKey);
      const thisMonthIncome = incomes
        .filter(i => {
          const d = new Date(i.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, i) => sum + i.amount, 0);
      setMonthlyIncome(thisMonthIncome);

      // 2. Fetch Expenses
      const expenses = await getAllRecords<ExpenseEntry>('expense_entries', cryptoKey);
      const thisMonthExpense = expenses
        .filter(e => {
          const d = new Date(e.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      setMonthlyExpense(thisMonthExpense);

      // 3. Fetch Banks, FDs, and Loans for Net Worth
      const bankAccounts = await getAllRecords<BankAccount>('bank_accounts', cryptoKey);
      const fdrds = await getAllRecords<FDRDEntry>('fdrd_entries', cryptoKey);
      const loans = await getAllRecords<Loan>('loans', cryptoKey);

      const totalBank = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
      const totalFD = fdrds.filter(f => f.status === 'Active').reduce((sum, f) => sum + f.principal, 0);
      const totalOutstandingLoans = loans.filter(l => l.status === 'Active').reduce((sum, l) => sum + l.outstandingAmount, 0);
      
      setTotalLoans(totalOutstandingLoans);
      setNetWorth(totalBank + totalFD - totalOutstandingLoans);

      // 4. Alerts Generation
      const newAlerts: typeof alerts = [];
      
      // LIC due check
      const licPolicies = await getAllRecords<LICPolicy>('lic_policies', cryptoKey);
      licPolicies.forEach(lic => {
        if (lic.status === 'Active') {
          const days = calcDaysRemaining(lic.nextDueDate);
          if (days < 0) {
            newAlerts.push({ id: `lic-${lic.localId}`, label: `LIC Overdue: ${lic.planName}`, type: 'red', icon: 'alert-circle' });
          } else if (days <= 7) {
            newAlerts.push({ id: `lic-${lic.localId}`, label: `LIC due in ${days}d`, type: 'orange', icon: 'time' });
          } else if (days <= 30) {
            newAlerts.push({ id: `lic-${lic.localId}`, label: `LIC due in ${days}d`, type: 'yellow', icon: 'calendar' });
          }
        }
      });

      // Insurance due check
      const insPolicies = await getAllRecords<InsurancePolicy>('insurance_policies', cryptoKey);
      insPolicies.forEach(ins => {
        if (ins.status === 'Active') {
          const days = calcDaysRemaining(ins.renewalDate);
          if (days < 0) {
            newAlerts.push({ id: `ins-${ins.localId}`, label: `Insurance Expired: ${ins.company}`, type: 'red', icon: 'shield-outline' });
          } else if (days <= 7) {
            newAlerts.push({ id: `ins-${ins.localId}`, label: `Renewal in ${days}d`, type: 'orange', icon: 'time' });
          } else if (days <= 30) {
            newAlerts.push({ id: `ins-${ins.localId}`, label: `Renewal in ${days}d`, type: 'yellow', icon: 'calendar' });
          }
        }
      });

      // Document expiring check
      const docs = await getAllRecords<ImportantDocument>('documents', cryptoKey);
      docs.forEach(doc => {
        if (doc.expiryDate && !doc.neverExpires) {
          const days = calcDaysRemaining(doc.expiryDate);
          if (days < 0) {
            newAlerts.push({ id: `doc-${doc.localId}`, label: `${doc.documentType} Expired`, type: 'red', icon: 'document-text' });
          } else if (days <= 30) {
            newAlerts.push({ id: `doc-${doc.localId}`, label: `${doc.documentType} expires in ${days}d`, type: 'orange', icon: 'alert' });
          }
        }
      });

      // Family Birthdays
      const members = await getAllRecords<FamilyMember>('family_members', cryptoKey);
      members.forEach(mem => {
        if (mem.dateOfBirth) {
          const birthDate = new Date(mem.dateOfBirth);
          const today = new Date();
          const nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
          if (nextBirthday < today) {
            nextBirthday.setFullYear(today.getFullYear() + 1);
          }
          const days = calcDaysRemaining(nextBirthday.toISOString().split('T')[0]);
          if (days === 0) {
            newAlerts.push({ id: `bday-${mem.localId}`, label: `Today is ${mem.name}'s Birthday!`, type: 'blue', icon: 'gift' });
          } else if (days <= 15) {
            newAlerts.push({ id: `bday-${mem.localId}`, label: `${mem.name}'s Bday in ${days}d`, type: 'blue', icon: 'gift' });
          }
        }
      });

      setAlerts(newAlerts);

      // 5. Chart 1: Expenses Category breakdown
      const thisMonthExpenses = expenses.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const catMap: Record<string, number> = {};
      thisMonthExpenses.forEach(e => {
        catMap[e.category] = (catMap[e.category] || 0) + e.amount;
      });

      const colors = ['#ffc091', '#38c8ff', '#ffd11a', '#e2f6d5', '#2ead4b', '#ff9f1c', '#4d908e', '#f9c74f'];
      const breakdown = Object.keys(catMap).map((cat, idx) => ({
        name: cat,
        amount: catMap[cat],
        color: colors[idx % colors.length]
      }));
      setCategoryBreakdown(breakdown);

      // 6. Chart 2: 6 Months Trend
      const trend: typeof monthlyTrend = [];
      for (let i = 5; i >= 0; i--) {
        const dateOffset = new Date();
        dateOffset.setMonth(currentMonth - i);
        const m = dateOffset.getMonth();
        const y = dateOffset.getFullYear();
        const monthLabel = dateOffset.toLocaleDateString('en-IN', { month: 'short' });

        const incSum = incomes.filter(inc => {
          const d = new Date(inc.date);
          return d.getMonth() === m && d.getFullYear() === y;
        }).reduce((sum, inc) => sum + inc.amount, 0);

        const expSum = expenses.filter(exp => {
          const d = new Date(exp.date);
          return d.getMonth() === m && d.getFullYear() === y;
        }).reduce((sum, exp) => sum + exp.amount, 0);

        trend.push({
          month: monthLabel,
          income: incSum,
          expense: expSum
        });
      }
      setMonthlyTrend(trend);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const netSavings = monthlyIncome - monthlyExpense;
  const savingsPct = monthlyIncome > 0 ? Math.round((netSavings / monthlyIncome) * 100) : 0;

  // Custom Chart Renderers (Pure SVG)
  const renderTrendBarChart = () => {
    if (monthlyTrend.length === 0) return null;
    const height = 150;
    const padding = 20;
    const chartWidth = SCREEN_WIDTH - 64; // Card width padding
    const maxVal = Math.max(...monthlyTrend.map(t => Math.max(t.income, t.expense, 1000)));

    const colWidth = (chartWidth - padding * 2) / monthlyTrend.length;

    return (
      <Svg height={height + 30} width={chartWidth}>
        {/* Draw Bars */}
        {monthlyTrend.map((t, idx) => {
          const x = padding + idx * colWidth;
          const incHeight = (t.income / maxVal) * height;
          const expHeight = (t.expense / maxVal) * height;

          return (
            <G key={t.month}>
              {/* Income Bar (Lime Green) */}
              <Rect
                x={x + 4}
                y={height - incHeight}
                width={colWidth / 2 - 4}
                height={incHeight}
                fill="#9fe870"
                rx={4}
              />
              {/* Expense Bar (Peach / Light Gray) */}
              <Rect
                x={x + colWidth / 2}
                y={height - expHeight}
                width={colWidth / 2 - 4}
                height={expHeight}
                fill="#ffd11a"
                rx={4}
              />
              {/* Label */}
              <SvgText
                x={x + colWidth / 2}
                y={height + 18}
                fill="#454745"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                {t.month}
              </SvgText>
            </G>
          );
        })}
        {/* Bottom border line */}
        <Line x1={padding} y1={height} x2={chartWidth - padding} y2={height} stroke="#0e0f0c" strokeWidth="1.5" />
      </Svg>
    );
  };

  const renderDonutChart = () => {
    if (categoryBreakdown.length === 0) {
      return (
        <View style={styles.centerChart}>
          <Text style={styles.chartPlaceholderText}>No expenses logged this month.</Text>
        </View>
      );
    }

    const radius = 50;
    const strokeWidth = 16;
    const circumference = 2 * Math.PI * radius;
    const total = categoryBreakdown.reduce((sum, c) => sum + c.amount, 0);

    let accumulatedAngle = 0;

    return (
      <View style={styles.donutContainer}>
        <Svg height={130} width={130}>
          <G rotation="-90" origin="65, 65">
            {categoryBreakdown.map((item, idx) => {
              const pct = item.amount / total;
              const strokeDashoffset = circumference - pct * circumference;
              const rotation = (accumulatedAngle / total) * 360;
              accumulatedAngle += item.amount;

              return (
                <Circle
                  key={item.name}
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  rotation={rotation}
                  origin="65, 65"
                />
              );
            })}
          </G>
        </Svg>
        <View style={styles.donutLegend}>
          {categoryBreakdown.slice(0, 4).map((item) => (
            <View key={item.name} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: item.color }]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {item.name}: {formatINR(item.amount)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderSavingsTrend = () => {
    if (monthlyTrend.length === 0) return null;
    const height = 150;
    const padding = 20;
    const chartWidth = SCREEN_WIDTH - 64;

    const points: number[] = monthlyTrend.map(t => t.income - t.expense);
    const minVal = Math.min(...points, 0);
    const maxVal = Math.max(...points, 1000);
    const valRange = maxVal - minVal;

    const colWidth = (chartWidth - padding * 2) / (monthlyTrend.length - 1);
    
    // Construct Path string
    let pathD = '';
    monthlyTrend.forEach((t, idx) => {
      const x = padding + idx * colWidth;
      const val = t.income - t.expense;
      const y = height - ((val - minVal) / valRange) * height;
      
      if (idx === 0) {
        pathD = `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
    });

    return (
      <Svg height={height + 30} width={chartWidth}>
        {/* Draw Grid Line for 0 Savings */}
        {minVal < 0 && (
          <Line
            x1={padding}
            y1={height - (Math.abs(minVal) / valRange) * height}
            x2={chartWidth - padding}
            y2={height - (Math.abs(minVal) / valRange) * height}
            stroke="#d03238"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
        )}
        {/* Draw Line */}
        <Path d={pathD} fill="none" stroke="#2ead4b" strokeWidth="3" />
        {/* Draw points */}
        {monthlyTrend.map((t, idx) => {
          const x = padding + idx * colWidth;
          const val = t.income - t.expense;
          const y = height - ((val - minVal) / valRange) * height;

          return (
            <G key={idx}>
              <Circle cx={x} cy={y} r="5" fill="#0e0f0c" stroke="#2ead4b" strokeWidth="2" />
              <SvgText
                x={x}
                y={height + 18}
                fill="#454745"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                {t.month}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  };

  const getAlertBg = (type: string) => {
    switch (type) {
      case 'red': return '#FEE2E2';
      case 'orange': return '#FFEDD5';
      case 'yellow': return '#FEF9C3';
      default: return '#DCFCE7';
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'red': return '#991B1B';
      case 'orange': return '#B91C1C';
      case 'yellow': return '#854D0E';
      default: return '#166534';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>KutumbKosh</Text>
          <Text style={styles.headerSubtitle}>Family Treasury</Text>
        </View>
        <SyncStatusDot />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : (
        <View>
          {/* Alert Strip */}
          {alerts.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.alertStrip}
              contentContainerStyle={{ paddingRight: 20 }}
            >
              {alerts.map((alt) => (
                <View 
                  key={alt.id} 
                  style={[styles.alertBadge, { backgroundColor: getAlertBg(alt.type) }]}
                >
                  <Ionicons name={alt.icon as any} size={16} color={getAlertColor(alt.type)} style={{ marginRight: 6 }} />
                  <Text style={[styles.alertText, { color: getAlertColor(alt.type) }]}>
                    {alt.label}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Section 1: Financial Cards (3 metric cards) */}
          <View style={styles.gridContainer}>
            <View style={[styles.metricCard, { backgroundColor: '#e2f6d5' }]}>
              <Text style={styles.cardLabel}>Income (Month)</Text>
              <AmountDisplay amount={monthlyIncome} color="#054d28" size={20} />
            </View>
            <View style={[styles.metricCard, { backgroundColor: '#FEE2E2' }]}>
              <Text style={styles.cardLabel}>Expenses (Month)</Text>
              <AmountDisplay amount={monthlyExpense} color="#991B1B" size={20} />
            </View>
            <View style={[styles.metricCard, { backgroundColor: '#E6F4FE', flexBasis: '100%' }]}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.cardLabel}>Net Savings</Text>
                  <AmountDisplay amount={netSavings} color="#0b3c5d" size={20} />
                </View>
                <View style={styles.pctBadge}>
                  <Text style={styles.pctBadgeText}>{savingsPct}% Saved</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Section 2: Wealth & Debt */}
          <View style={styles.gridContainer}>
            <View style={[styles.metricCard, { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#0e0f0c', flex: 1, marginRight: 8 }]}>
              <Text style={styles.cardLabel}>Outstanding Debt</Text>
              <AmountDisplay amount={totalLoans} color="#d03238" size={18} />
            </View>
            <View style={[styles.metricCard, { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#0e0f0c', flex: 1, marginLeft: 8 }]}>
              <Text style={styles.cardLabel}>Estimated Net Worth</Text>
              <AmountDisplay amount={netWorth} color="#2ead4b" size={18} />
            </View>
          </View>

          {/* Section 3: Swipeable Charts */}
          <View style={styles.chartWrapper}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>
                {activeChartSlide === 0 && '6-Month Cash Flow'}
                {activeChartSlide === 1 && 'Expenses Breakdown'}
                {activeChartSlide === 2 && 'Net Savings Trend'}
              </Text>
              <View style={styles.chartDots}>
                {[0, 1, 2].map((s) => (
                  <View 
                    key={s} 
                    style={[styles.chartDot, activeChartSlide === s && styles.chartDotActive]} 
                  />
                ))}
              </View>
            </View>

            <ScrollView 
              horizontal 
              pagingEnabled 
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const page = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 32));
                setActiveChartSlide(page);
              }}
            >
              {/* Slide 1 */}
              <View style={styles.chartSlide}>
                {renderTrendBarChart()}
              </View>

              {/* Slide 2 */}
              <View style={styles.chartSlide}>
                {renderDonutChart()}
              </View>

              {/* Slide 3 */}
              <View style={styles.chartSlide}>
                {renderSavingsTrend()}
              </View>
            </ScrollView>
          </View>
          
          {/* Quick Actions Title */}
          <Text style={styles.sectionTitle}>Quick Entry</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/money/income')}>
              <Ionicons name="arrow-up-circle" size={32} color="#2ead4b" />
              <Text style={styles.actionText}>Add Income</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/money/expenses')}>
              <Ionicons name="arrow-down-circle" size={32} color="#d03238" />
              <Text style={styles.actionText}>Add Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/records')}>
              <Ionicons name="folder-open" size={32} color="#0e0f0c" />
              <Text style={styles.actionText}>All Vaults</Text>
            </TouchableOpacity>
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
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0e0f0c',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#454745',
    marginTop: 2,
  },
  alertStrip: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    marginRight: 10,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricCard: {
    borderRadius: 20, // rounded.lg
    padding: 16,
    flexBasis: '48.5%',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#454745',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pctBadge: {
    backgroundColor: '#0b3c5d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pctBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  chartWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 24, // rounded.xl
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    marginBottom: 20,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  chartDots: {
    flexDirection: 'row',
  },
  chartDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#868685',
    marginHorizontal: 3,
  },
  chartDotActive: {
    backgroundColor: '#0e0f0c',
    width: 14,
  },
  chartSlide: {
    width: SCREEN_WIDTH - 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerChart: {
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    fontSize: 13,
    color: '#868685',
    fontWeight: '600',
  },
  donutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  donutLegend: {
    marginLeft: 16,
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#454745',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0e0f0c',
    marginVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    flexBasis: '31%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1.5,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e0f0c',
    marginTop: 8,
  },
});
