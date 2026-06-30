import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../../src/store/authStore';
import { getAllRecords } from '../../../src/db/crud';
import { formatINR } from '../../../src/utils/calculations';
import type {
  BankAccount,
  LICPolicy,
  InsurancePolicy,
  Loan,
  ImportantDocument,
  FDRDEntry,
  Property,
  SavingsGoal,
  FamilyMember,
} from '@kutumbkosh/shared';

interface SearchItem {
  localId: string;
  type: 'bank' | 'lic' | 'insurance' | 'loan' | 'document' | 'fdrd' | 'property' | 'goal' | 'member';
  title: string;
  subtitle: string;
  details: string;
  route: string;
  notes?: string;
}

const TYPE_CONFIG = {
  bank: { label: 'Bank Account', icon: 'business', bg: '#E6F4FE', color: '#0070f3' },
  lic: { label: 'LIC Policy', icon: 'heart', bg: '#FEE2E2', color: '#d32f2f' },
  insurance: { label: 'General Insurance', icon: 'shield-checkmark', bg: '#FFEDD5', color: '#c2410c' },
  loan: { label: 'Loans & EMI', icon: 'card', bg: '#F3E8FF', color: '#7b2cbf' },
  document: { label: 'Important Doc', icon: 'document-text', bg: '#E0F2FE', color: '#0284c7' },
  fdrd: { label: 'FD & RD', icon: 'trending-up', bg: '#DCFCE7', color: '#166534' },
  property: { label: 'Property', icon: 'home', bg: '#FEF9C3', color: '#854D0E' },
  goal: { label: 'Savings Goal', icon: 'ribbon', bg: '#FCE7F3', color: '#db2777' },
  member: { label: 'Family Member', icon: 'people', bg: '#e2f6d5', color: '#2ead4b' },
};

export default function GlobalSearchScreen() {
  const { cryptoKey } = useAuthStore();
  const [query, setQuery] = useState('');
  const [allItems, setAllItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSearchIndex();
    }, [cryptoKey])
  );

  const loadSearchIndex = async () => {
    if (!cryptoKey) return;
    setLoading(true);
    try {
      const [
        banks,
        lics,
        insurances,
        loans,
        docs,
        fdrds,
        properties,
        goals,
        members
      ] = await Promise.all([
        getAllRecords<BankAccount>('bank_accounts', cryptoKey),
        getAllRecords<LICPolicy>('lic_policies', cryptoKey),
        getAllRecords<InsurancePolicy>('insurance_policies', cryptoKey),
        getAllRecords<Loan>('loans', cryptoKey),
        getAllRecords<ImportantDocument>('documents', cryptoKey),
        getAllRecords<FDRDEntry>('fdrd_entries', cryptoKey),
        getAllRecords<Property>('property', cryptoKey),
        getAllRecords<SavingsGoal>('savings_goals', cryptoKey),
        getAllRecords<FamilyMember>('family_members', cryptoKey),
      ]);

      const compiled: SearchItem[] = [];

      banks.forEach(b => {
        compiled.push({
          localId: b.localId,
          type: 'bank',
          title: b.bankName,
          subtitle: `${b.accountType} · A/C No: ${b.accountNumber}`,
          details: `Balance: ${formatINR(b.balance)}`,
          route: '/(main)/records/banks',
          notes: b.notes,
        });
      });

      lics.forEach(l => {
        compiled.push({
          localId: l.localId,
          type: 'lic',
          title: l.planName,
          subtitle: `Policy No: ${l.policyNumber}`,
          details: `Premium: ${formatINR(l.premiumAmount)} · Sum Assured: ${formatINR(l.sumAssured)}`,
          route: '/(main)/records/lic',
          notes: l.notes,
        });
      });

      insurances.forEach(i => {
        compiled.push({
          localId: i.localId,
          type: 'insurance',
          title: i.company,
          subtitle: `${i.insuranceType} · Policy No: ${i.policyNumber}`,
          details: `Premium: ${formatINR(i.premium)} · Coverage: ${formatINR(i.coverageAmount)}`,
          route: '/(main)/records/insurance',
          notes: i.notes,
        });
      });

      loans.forEach(l => {
        compiled.push({
          localId: l.localId,
          type: 'loan',
          title: l.lender,
          subtitle: `${l.loanType}`,
          details: `EMI: ${formatINR(l.emi)} · Outstanding: ${formatINR(l.outstandingAmount)}`,
          route: '/(main)/records/loans',
          notes: l.notes,
        });
      });

      docs.forEach(d => {
        compiled.push({
          localId: d.localId,
          type: 'document',
          title: d.documentType,
          subtitle: d.neverExpires ? 'Never Expires' : `Expires: ${d.expiryDate}`,
          details: d.notes || 'No description',
          route: '/(main)/records/documents',
          notes: d.notes,
        });
      });

      fdrds.forEach(f => {
        compiled.push({
          localId: f.localId,
          type: 'fdrd',
          title: `${f.type} at ${f.bank}`,
          subtitle: `Principal: ${formatINR(f.principal)} @ ${f.interestRate}%`,
          details: `Matures: ${formatINR(f.maturityAmount)} on ${f.maturityDate}`,
          route: '/(main)/records/fdrd',
          notes: f.notes,
        });
      });

      properties.forEach(p => {
        compiled.push({
          localId: p.localId,
          type: 'property',
          title: p.name,
          subtitle: p.location,
          details: `Current Value: ${formatINR(p.currentValue ?? p.purchasePrice ?? 0)}`,
          route: '/(main)/records/property',
          notes: p.notes,
        });
      });

      goals.forEach(g => {
        compiled.push({
          localId: g.localId,
          type: 'goal',
          title: g.title,
          subtitle: `Saved: ${formatINR(g.savedAmount)} / Target: ${formatINR(g.targetAmount)}`,
          details: `Target Date: ${g.targetDate}`,
          route: '/(main)/records/goals',
          notes: g.notes,
        });
      });

      members.forEach(m => {
        compiled.push({
          localId: m.localId,
          type: 'member',
          title: m.name,
          subtitle: `Blood Group: ${m.bloodGroup || 'Not Specified'}`,
          details: `Relation: ${m.relationship || 'Self'}`,
          route: '/(main)/records/members',
          notes: m.notes,
        });
      });

      setAllItems(compiled);
    } catch (e) {
      console.warn('Failed to load search data:', e);
      Alert.alert('Error', 'Failed to load search index');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredItems = () => {
    if (!query.trim()) return [];
    const cleanQuery = query.toLowerCase().trim();
    return allItems.filter(item => {
      return (
        item.title.toLowerCase().includes(cleanQuery) ||
        item.subtitle.toLowerCase().includes(cleanQuery) ||
        item.details.toLowerCase().includes(cleanQuery) ||
        (item.notes && item.notes.toLowerCase().includes(cleanQuery))
      );
    });
  };

  const handlePressItem = (item: SearchItem) => {
    router.push({
      pathname: item.route as any,
      params: { editId: item.localId },
    });
  };

  const filtered = getFilteredItems();

  return (
    <View style={styles.container}>
      {/* Header with Search Input */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <View style={styles.inputContainer}>
          <Ionicons name="search" size={20} color="#868685" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search all encrypted vaults..."
            placeholderTextColor="#868685"
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color="#868685" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && allItems.length === 0 ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 80 }} />
      ) : !query.trim() ? (
        <View style={styles.infoContainer}>
          <Ionicons name="shield-checkmark" size={64} color="#868685" />
          <Text style={styles.infoTitle}>Secure Global Search</Text>
          <Text style={styles.infoText}>
            Type to search across all your encrypted bank accounts, family members, policies, properties, documents, and goals.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.infoContainer}>
          <Ionicons name="search-outline" size={64} color="#868685" />
          <Text style={styles.infoTitle}>No Results Found</Text>
          <Text style={styles.infoText}>
            Could not find any vault records matching "{query}". Check spelling or try a different keyword.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.type}-${item.localId}`}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          renderItem={({ item }) => {
            const config = TYPE_CONFIG[item.type];
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => handlePressItem(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: config.bg }]}>
                    <Ionicons name={config.icon as any} size={14} color={config.color} style={{ marginRight: 6 }} />
                    <Text style={[styles.typeLabel, { color: config.color }]}>{config.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                <Text style={styles.cardDetails}>{item.details}</Text>
                {item.notes ? (
                  <View style={styles.notesContainer}>
                    <Text style={styles.notesText} numberOfLines={1}>
                      Note: {item.notes}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ebe6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#0e0f0c',
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0e0f0c',
    marginTop: 16,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#454745',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#0e0f0c',
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#454745',
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 12,
    color: '#868685',
  },
  notesContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e8ebe6',
  },
  notesText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#868685',
  },
});
