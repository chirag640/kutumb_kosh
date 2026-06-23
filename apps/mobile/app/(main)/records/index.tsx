import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert 
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/store/authStore';
import { getAllRecords } from '../../../src/db/crud';

export default function RecordsMenuScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({
    banks: 0,
    lic: 0,
    insurance: 0,
    loans: 0,
    documents: 0,
    fdrd: 0,
    property: 0,
    goals: 0,
    members: 0,
  });

  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const banks = await getAllRecords('bank_accounts', cryptoKey);
      const lic = await getAllRecords('lic_policies', cryptoKey);
      const ins = await getAllRecords('insurance_policies', cryptoKey);
      const loans = await getAllRecords('loans', cryptoKey);
      const docs = await getAllRecords('documents', cryptoKey);
      const fdrds = await getAllRecords('fdrd_entries', cryptoKey);
      const properties = await getAllRecords('property', cryptoKey);
      const goals = await getAllRecords('savings_goals', cryptoKey);
      const members = await getAllRecords('family_members', cryptoKey);

      setCounts({
        banks: banks.length,
        lic: lic.length,
        insurance: ins.length,
        loans: loans.length,
        documents: docs.length,
        fdrd: fdrds.length,
        property: properties.length,
        goals: goals.length,
        members: members.length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const recordsList = [
    { id: 'members', label: 'Family Members', route: '/(main)/records/members', icon: 'people', count: counts.members, bg: '#e2f6d5', color: '#2ead4b' },
    { id: 'banks', label: 'Bank Accounts', route: '/(main)/records/banks', icon: 'business', count: counts.banks, bg: '#E6F4FE', color: '#0070f3' },
    { id: 'lic', label: 'LIC Policies', route: '/(main)/records/lic', icon: 'heart', count: counts.lic, bg: '#FEE2E2', color: '#d32f2f' },
    { id: 'insurance', label: 'General Insurance', route: '/(main)/records/insurance', icon: 'shield-checkmark', count: counts.insurance, bg: '#FFEDD5', color: '#c2410c' },
    { id: 'loans', label: 'Loans & EMI', route: '/(main)/records/loans', icon: 'card', count: counts.loans, bg: '#F3E8FF', color: '#7b2cbf' },
    { id: 'documents', label: 'Important Docs', route: '/(main)/records/documents', icon: 'document-text', count: counts.documents, bg: '#E0F2FE', color: '#0284c7' },
    { id: 'fdrd', label: 'FD & RD Tracker', route: '/(main)/records/fdrd', icon: 'trending-up', count: counts.fdrd, bg: '#DCFCE7', color: '#166534' },
    { id: 'property', label: 'Property Register', route: '/(main)/records/property', icon: 'home', count: counts.property, bg: '#FEF9C3', color: '#854D0E' },
    { id: 'goals', label: 'Savings Goals', route: '/(main)/records/goals', icon: 'ribbon', count: counts.goals, bg: '#FCE7F3', color: '#db2777' },
  ];

  const summaryList = [
    { id: 'cashflow', label: 'Cash Flow Summary', route: '/(main)/records/cashflow', icon: 'bar-chart', bg: '#ffffff' },
    { id: 'annual', label: 'Annual summary', route: '/(main)/records/annual', icon: 'pie-chart', bg: '#ffffff' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Financial Vaults</Text>
        <Text style={styles.subtitle}>All family records are double-encrypted at rest.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 40 }} />
      ) : (
        <View>
          <Text style={styles.sectionTitle}>Asset & Liability Vaults</Text>
          <View style={styles.grid}>
            {recordsList.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => router.push(item.route as any)}
              >
                <View style={[styles.iconContainer, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon as any} size={24} color={item.color} />
                </View>
                <Text style={styles.cardLabel}>{item.label}</Text>
                <Text style={styles.cardCount}>{item.count} items</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Summaries & Reports</Text>
          <View style={styles.summaryList}>
            {summaryList.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.summaryRow}
                onPress={() => router.push(item.route as any)}
              >
                <View style={styles.summaryRowLeft}>
                  <Ionicons name={item.icon as any} size={20} color="#0e0f0c" style={{ marginRight: 12 }} />
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#868685" />
              </TouchableOpacity>
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
    color: '#454745',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 16,
    marginTop: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    flexBasis: '48%',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  cardCount: {
    fontSize: 12,
    color: '#868685',
    marginTop: 4,
  },
  summaryList: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    overflow: 'hidden',
    marginBottom: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
  },
  summaryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e0f0c',
  },
});
