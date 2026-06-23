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
import { useAuthStore } from '../../src/store/authStore';
import { getAllRecords } from '../../src/db/crud';
import { calcDaysRemaining } from '../../src/utils/calculations';
import type { 
  LICPolicy, 
  InsurancePolicy, 
  ImportantDocument, 
  FDRDEntry, 
  SavingsGoal 
} from '@kutumbkosh/shared';

interface ReminderItem {
  id: string;
  title: string;
  dateStr: string;
  daysRemaining: number;
  type: 'lic' | 'insurance' | 'document' | 'fdrd' | 'goal';
  meta: string;
}

export default function RemindersScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const items: ReminderItem[] = [];

      // 1. LIC dues
      const lic = await getAllRecords<LICPolicy>('lic_policies', cryptoKey);
      lic.forEach(l => {
        if (l.status === 'Active') {
          const days = calcDaysRemaining(l.nextDueDate);
          items.push({
            id: `lic-${l.localId}`,
            title: `LIC Premium: ${l.planName}`,
            dateStr: l.nextDueDate,
            daysRemaining: days,
            type: 'lic',
            meta: `Policy holder member. Premium amount: ${l.premiumAmount}`,
          });
        }
      });

      // 2. Insurance renewals
      const ins = await getAllRecords<InsurancePolicy>('insurance_policies', cryptoKey);
      ins.forEach(i => {
        if (i.status === 'Active') {
          const days = calcDaysRemaining(i.renewalDate);
          items.push({
            id: `ins-${i.localId}`,
            title: `Insurance Renewal: ${i.company}`,
            dateStr: i.renewalDate,
            daysRemaining: days,
            type: 'insurance',
            meta: `${i.insuranceType} Policy, Premium: ${i.premium}`,
          });
        }
      });

      // 3. Documents expiry
      const docs = await getAllRecords<ImportantDocument>('documents', cryptoKey);
      docs.forEach(d => {
        if (d.expiryDate && !d.neverExpires) {
          const days = calcDaysRemaining(d.expiryDate);
          items.push({
            id: `doc-${d.localId}`,
            title: `Document Expiry: ${d.documentType}`,
            dateStr: d.expiryDate,
            daysRemaining: days,
            type: 'document',
            meta: `Doc number: ${d.documentNumber}`,
          });
        }
      });

      // 4. FD/RD maturities
      const fdrds = await getAllRecords<FDRDEntry>('fdrd_entries', cryptoKey);
      fdrds.forEach(f => {
        if (f.status === 'Active') {
          const days = calcDaysRemaining(f.maturityDate);
          items.push({
            id: `fdrd-${f.localId}`,
            title: `${f.type} Maturity: ${f.bank}`,
            dateStr: f.maturityDate,
            daysRemaining: days,
            type: 'fdrd',
            meta: `Maturity amount: ${f.maturityAmount}`,
          });
        }
      });

      // 5. Goals targets
      const goals = await getAllRecords<SavingsGoal>('savings_goals', cryptoKey);
      goals.forEach(g => {
        if (g.status === 'Active') {
          const days = calcDaysRemaining(g.targetDate);
          items.push({
            id: `goal-${g.localId}`,
            title: `Savings Target: ${g.title}`,
            dateStr: g.targetDate,
            daysRemaining: days,
            type: 'goal',
            meta: `Target amount: ${g.targetAmount}`,
          });
        }
      });

      // Sort by days remaining (ascending, e.g. overdue first)
      items.sort((a, b) => a.daysRemaining - b.daysRemaining);
      setReminders(items);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load reminders timeline');
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyIcon = (type: string) => {
    switch (type) {
      case 'lic': return 'heart';
      case 'insurance': return 'shield-checkmark';
      case 'document': return 'document-text';
      case 'fdrd': return 'trending-up';
      default: return 'ribbon';
    }
  };

  const getUrgencyColor = (days: number) => {
    if (days < 0) return '#d03238'; // Red (Overdue)
    if (days <= 7) return '#ffc091'; // Orange (This week)
    if (days <= 30) return '#ffd11a'; // Yellow (This month)
    return '#2ead4b'; // Green (Later)
  };

  const getGroupedReminders = () => {
    const overdue = reminders.filter(r => r.daysRemaining < 0);
    const thisWeek = reminders.filter(r => r.daysRemaining >= 0 && r.daysRemaining <= 7);
    const thisMonth = reminders.filter(r => r.daysRemaining > 7 && r.daysRemaining <= 30);
    const later = reminders.filter(r => r.daysRemaining > 30);

    const sections = [];
    if (overdue.length > 0) sections.push({ title: '🔴 Overdue Dues', data: overdue });
    if (thisWeek.length > 0) sections.push({ title: '🟠 Due This Week', data: thisWeek });
    if (thisMonth.length > 0) sections.push({ title: '🟡 Due This Month', data: thisMonth });
    if (later.length > 0) sections.push({ title: '🟢 Due Later', data: later });

    return sections;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reminders & Renewals</Text>
        <Text style={styles.subtitle}>Aggregated timeline of all financial dues and expirations.</Text>
      </View>

      {loading && reminders.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : reminders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={64} color="#868685" />
          <Text style={styles.emptyTitle}>No Upcoming Renewals</Text>
          <Text style={styles.emptySubtitle}>All your policies, documents and savings goals are currently up to date.</Text>
        </View>
      ) : (
        <FlatList
          data={getGroupedReminders()}
          keyExtractor={(item) => item.title}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View>
              <Text style={styles.sectionHeader}>{item.title}</Text>
              {item.data.map((rem) => (
                <View key={rem.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardLeft}>
                      <View style={[styles.iconContainer, { backgroundColor: getUrgencyColor(rem.daysRemaining) + '20' }]}>
                        <Ionicons name={getUrgencyIcon(rem.type) as any} size={20} color={getUrgencyColor(rem.daysRemaining)} />
                      </View>
                      <View style={styles.metaContainer}>
                        <Text style={styles.cardTitle}>{rem.title}</Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>{rem.meta}</Text>
                      </View>
                    </View>
                    <View style={styles.cardRight}>
                      <Text style={[styles.daysText, { color: getUrgencyColor(rem.daysRemaining) }]}>
                        {rem.daysRemaining < 0 
                          ? `${Math.abs(rem.daysRemaining)}d overdue` 
                          : rem.daysRemaining === 0 
                          ? 'Today' 
                          : `${rem.daysRemaining}d left`}
                      </Text>
                      <Text style={styles.dateText}>{rem.dateStr.split('-').reverse().join('/')}</Text>
                    </View>
                  </View>
                </View>
              ))}
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
    marginTop: 40,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0e0f0c',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: '#454745',
    marginTop: 4,
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
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
    marginTop: 24,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  metaContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  cardMeta: {
    fontSize: 11,
    color: '#868685',
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  daysText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dateText: {
    fontSize: 10,
    color: '#868685',
    marginTop: 4,
  },
});
