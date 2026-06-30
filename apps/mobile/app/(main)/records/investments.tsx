import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Vibration,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/store/authStore';
import { insertRecord, getAllRecords, deleteRecord, updateRecord } from '../../../src/db/crud';
import { AmountDisplay } from '../../../src/components/AmountDisplay';
import { formatINR } from '../../../src/utils/calculations';
import { Theme } from '../../../src/constants/theme';

interface InvestmentRecord {
  localId: string;
  assetType: 'stock' | 'mutual_fund';
  name: string;
  ticker?: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
}

export default function InvestmentsScreen() {
  const { cryptoKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);

  // Form states
  const [modalVisible, setModalVisible] = useState(false);
  const [assetType, setAssetType] = useState<'stock' | 'mutual_fund'>('mutual_fund');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');

  // Edit states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editRecord, setEditRecord] = useState<InvestmentRecord | null>(null);
  const [editCurrentPrice, setEditCurrentPrice] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [cryptoKey])
  );

  const loadData = async (isRefreshing = false) => {
    if (!cryptoKey) return;
    if (!isRefreshing) setLoading(true);
    try {
      const records = await getAllRecords<InvestmentRecord>('investments', cryptoKey);
      setInvestments(records);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load investments');
    } finally {
      if (!isRefreshing) setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    if (!cryptoKey) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name.');
      return;
    }
    const qty = Number(quantity);
    const buyPrice = Number(purchasePrice);
    const currPrice = currentPrice ? Number(currentPrice) : buyPrice;

    if (isNaN(qty) || qty <= 0 || isNaN(buyPrice) || buyPrice <= 0) {
      Alert.alert('Error', 'Please enter valid quantity and price.');
      return;
    }

    setLoading(true);
    try {
      await insertRecord(
        'investments',
        {
          assetType,
          name,
          ticker: ticker || undefined,
          quantity: qty,
          purchasePrice: buyPrice,
          currentPrice: currPrice,
        },
        cryptoKey,
        {
          asset_type: assetType,
          ticker: ticker || undefined,
        }
      );

      Vibration.vibrate(20);
      setModalVisible(false);
      setName('');
      setTicker('');
      setQuantity('');
      setPurchasePrice('');
      setCurrentPrice('');
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save investment.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCurrentPrice = async () => {
    if (!cryptoKey || !editRecord) return;
    const nextPrice = Number(editCurrentPrice);
    if (isNaN(nextPrice) || nextPrice <= 0) {
      Alert.alert('Error', 'Please enter a valid price.');
      return;
    }

    setLoading(true);
    try {
      await updateRecord(
        'investments',
        editRecord.localId,
        {
          ...editRecord,
          currentPrice: nextPrice,
        },
        cryptoKey,
        {
          asset_type: editRecord.assetType,
          ticker: editRecord.ticker || undefined,
        }
      );

      Vibration.vibrate(20);
      setEditModalVisible(false);
      setEditRecord(null);
      setEditCurrentPrice('');
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to update price.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (localId: string) => {
    Alert.alert('Delete Record', 'Are you sure you want to delete this investment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteRecord('investments', localId);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete record');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // Calculations
  let totalInvested = 0;
  let totalCurrentValuation = 0;
  investments.forEach((inv) => {
    totalInvested += inv.quantity * inv.purchasePrice;
    totalCurrentValuation += inv.quantity * inv.currentPrice;
  });
  const totalReturn = totalCurrentValuation - totalInvested;
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0e0f0c" />
        </TouchableOpacity>
        <Text style={styles.title}>Investment Portfolio</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#0e0f0c" />
        </TouchableOpacity>
      </View>

      {/* Portfolio Card */}
      <View style={styles.portfolioCard}>
        <Text style={styles.portfolioLabel}>Total Valuation</Text>
        <Text style={styles.portfolioValue}>{formatINR(totalCurrentValuation)}</Text>
        <View style={styles.portfolioStats}>
          <View>
            <Text style={styles.statLabel}>Invested</Text>
            <Text style={styles.statValue}>{formatINR(totalInvested)}</Text>
          </View>
          <View style={styles.divider} />
          <View>
            <Text style={styles.statLabel}>Gain / Loss</Text>
            <Text
              style={[
                styles.statValue,
                { color: totalReturn >= 0 ? '#2ead4b' : '#d03238' },
              ]}
            >
              {totalReturn >= 0 ? '+' : ''}
              {formatINR(totalReturn)} ({totalReturnPct.toFixed(1)}%)
            </Text>
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#0e0f0c" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={investments}
          keyExtractor={(item) => item.localId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData(true);
              }}
              colors={['#0e0f0c']}
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const cost = item.quantity * item.purchasePrice;
            const value = item.quantity * item.currentPrice;
            const gain = value - cost;
            const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

            return (
              <View style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View>
                    <View style={styles.badgeRow}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.typeBadge}>
                        {item.assetType === 'stock' ? 'Stock' : 'Mutual Fund'}
                      </Text>
                    </View>
                    {item.ticker && <Text style={styles.itemTicker}>{item.ticker}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item.localId)}>
                    <Ionicons name="trash-outline" size={20} color="#d03238" />
                  </TouchableOpacity>
                </View>

                <View style={styles.itemStatsGrid}>
                  <View>
                    <Text style={styles.itemStatSub}>Qty: {item.quantity}</Text>
                    <Text style={styles.itemStatSub}>Avg Buy: {formatINR(item.purchasePrice)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.itemValuation}>{formatINR(value)}</Text>
                    <Text
                      style={[
                        styles.itemGain,
                        { color: gain >= 0 ? '#2ead4b' : '#d03238' },
                      ]}
                    >
                      {gain >= 0 ? '+' : ''}
                      {gainPct.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.updatePriceBtn}
                  onPress={() => {
                    setEditRecord(item);
                    setEditCurrentPrice(String(item.currentPrice));
                    setEditModalVisible(true);
                  }}
                >
                  <Text style={styles.updatePriceText}>Update Current Price</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Add Investment Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Investment</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.label}>Asset Type</Text>
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[
                    styles.pickerChip,
                    assetType === 'mutual_fund' && styles.pickerChipActive,
                  ]}
                  onPress={() => setAssetType('mutual_fund')}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      assetType === 'mutual_fund' && styles.pickerChipTextActive,
                    ]}
                  >
                    Mutual Fund
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.pickerChip,
                    assetType === 'stock' && styles.pickerChipActive,
                  ]}
                  onPress={() => setAssetType('stock')}
                >
                  <Text
                    style={[
                      styles.pickerChipText,
                      assetType === 'stock' && styles.pickerChipTextActive,
                    ]}
                  >
                    Stock
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Scheme / Company Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Nippon India Small Cap Fund"
                placeholderTextColor="#868685"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Ticker / Symbol (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. NIPPON_CAP"
                placeholderTextColor="#868685"
                value={ticker}
                onChangeText={setTicker}
              />

              <Text style={styles.label}>Quantity</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
              />

              <Text style={styles.label}>Avg Purchase Price (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 0.00"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={purchasePrice}
                onChangeText={setPurchasePrice}
              />

              <Text style={styles.label}>Current Price / NAV (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 0.00"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={currentPrice}
                onChangeText={setCurrentPrice}
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                <Text style={styles.saveBtnText}>Add Investment</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Current Price Modal */}
      <Modal visible={editModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update NAV / Market Price</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0e0f0c" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={styles.label}>Current Price (INR)</Text>
              <TextInput
                style={styles.input}
                placeholder="₹ 0.00"
                placeholderTextColor="#868685"
                keyboardType="numeric"
                value={editCurrentPrice}
                onChangeText={setEditCurrentPrice}
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateCurrentPrice}>
                <Text style={styles.saveBtnText}>Update Price</Text>
              </TouchableOpacity>
            </View>
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
  addBtn: {
    padding: 4,
  },
  portfolioCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 20,
    marginBottom: 20,
  },
  portfolioLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#868685',
    textTransform: 'uppercase',
  },
  portfolioValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0e0f0c',
    marginVertical: 4,
  },
  portfolioStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e8ebe6',
    paddingTop: 12,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#868685',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0e0f0c',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: '#e8ebe6',
    marginHorizontal: 24,
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
    paddingBottom: 10,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  typeBadge: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    backgroundColor: '#f6f8f5',
    color: '#454745',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e8ebe6',
  },
  itemTicker: {
    fontSize: 11,
    color: '#868685',
    fontWeight: '600',
    marginTop: 2,
  },
  itemStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemStatSub: {
    fontSize: 12,
    color: '#454745',
    fontWeight: '600',
    marginVertical: 2,
  },
  itemValuation: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0e0f0c',
  },
  itemGain: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  updatePriceBtn: {
    backgroundColor: '#f6f8f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8ebe6',
    paddingVertical: 8,
    alignItems: 'center',
  },
  updatePriceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: '#0e0f0c',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebe6',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  modalScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#454745',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pickerContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  pickerChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e8ebe6',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  pickerChipActive: {
    borderColor: '#0e0f0c',
    backgroundColor: '#9fe870',
  },
  pickerChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#868685',
  },
  pickerChipTextActive: {
    color: '#0e0f0c',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0e0f0c',
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: '#9fe870',
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
});
