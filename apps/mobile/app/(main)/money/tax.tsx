import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform as RNPlatform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../../../src/constants/theme';
import { formatINR } from '../../../src/utils/calculations';

export default function TaxPlannerScreen() {
  const [grossIncome, setGrossIncome] = useState('');
  const [deduction80C, setDeduction80C] = useState('');
  const [deduction80D, setDeduction80D] = useState('');
  const [nps80CCD, setNps80CCD] = useState('');
  const [hraExemption, setHraExemption] = useState('');
  const [homeLoanInterest, setHomeLoanInterest] = useState('');

  // Math engine
  const gross = Number(grossIncome) || 0;
  const d80c = Math.min(Number(deduction80C) || 0, 150000);
  const d80d = Math.min(Number(deduction80D) || 0, 75000);
  const nps = Math.min(Number(nps80CCD) || 0, 50000);
  const hra = Number(hraExemption) || 0;
  const hLoan = Math.min(Number(homeLoanInterest) || 0, 200000);

  // 1. Old Regime Calculation
  const stdDeductionOld = gross > 0 ? 50000 : 0;
  const totalDeductionsOld = d80c + d80d + nps + hra + hLoan + stdDeductionOld;
  const taxableIncomeOld = Math.max(gross - totalDeductionsOld, 0);

  let taxOld = 0;
  if (taxableIncomeOld > 250000) {
    if (taxableIncomeOld <= 500000) {
      taxOld = (taxableIncomeOld - 250000) * 0.05;
    } else if (taxableIncomeOld <= 1000000) {
      taxOld = 12500 + (taxableIncomeOld - 500000) * 0.20;
    } else {
      taxOld = 12500 + 100000 + (taxableIncomeOld - 1000000) * 0.30;
    }
  }
  // Rebate u/s 87A for Old Regime (up to 5 Lakhs taxable income)
  if (taxableIncomeOld <= 500000) {
    taxOld = 0;
  }
  const cessOld = taxOld * 0.04;
  const totalTaxOld = taxOld + cessOld;

  // 2. New Regime Calculation (FY 2024-25 Slabs)
  const stdDeductionNew = gross > 0 ? 75000 : 0;
  // Under new regime, 80C, 80D, HRA, and Section 24b are NOT allowed.
  const taxableIncomeNew = Math.max(gross - stdDeductionNew, 0);

  let taxNew = 0;
  if (taxableIncomeNew > 300000) {
    if (taxableIncomeNew <= 700000) {
      taxNew = (taxableIncomeNew - 300000) * 0.05;
    } else if (taxableIncomeNew <= 1000000) {
      taxNew = 20000 + (taxableIncomeNew - 700000) * 0.10;
    } else if (taxableIncomeNew <= 1200000) {
      taxNew = 50000 + (taxableIncomeNew - 1000000) * 0.15;
    } else if (taxableIncomeNew <= 1500000) {
      taxNew = 80000 + (taxableIncomeNew - 1200000) * 0.20;
    } else {
      taxNew = 140000 + (taxableIncomeNew - 1500000) * 0.30;
    }
  }
  // Rebate u/s 87A for New Regime (up to 7 Lakhs taxable income)
  if (taxableIncomeNew <= 700000) {
    taxNew = 0;
  }
  const cessNew = taxNew * 0.04;
  const totalTaxNew = taxNew + cessNew;

  const difference = Math.abs(totalTaxOld - totalTaxNew);
  const recommendedRegime = totalTaxOld === totalTaxNew 
    ? 'Equally Beneficial' 
    : totalTaxOld < totalTaxNew 
    ? 'Old Regime' 
    : 'New Regime';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={styles.toggleContainer}>
          <TouchableOpacity 
            style={styles.toggleBtn} 
            onPress={() => router.replace('/money/income')}
          >
            <Text style={styles.toggleTextInactive}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.toggleBtn} 
            onPress={() => router.replace('/money')}
          >
            <Text style={styles.toggleTextInactive}>Expenses</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, styles.toggleActive]}>
            <Text style={styles.toggleTextActive}>Tax</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Income Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Income Details</Text>
          <Text style={styles.label}>Gross Annual Income (INR)</Text>
          <TextInput
            style={styles.input}
            placeholder="₹ 12,00,000"
            placeholderTextColor="#868685"
            keyboardType="numeric"
            value={grossIncome}
            onChangeText={setGrossIncome}
          />
        </View>

        {/* Deductions Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Old Regime Deductions</Text>
          <Text style={styles.desc}>These deductions are not applicable under the New Regime.</Text>

          <Text style={styles.label}>Section 80C (PPF, ELSS, LIC, Tuition Fee) — Max ₹1.5L</Text>
          <TextInput
            style={styles.input}
            placeholder="₹ 1,50,000"
            placeholderTextColor="#868685"
            keyboardType="numeric"
            value={deduction80C}
            onChangeText={setDeduction80C}
          />

          <Text style={styles.label}>Section 80D (Health Insurance) — Max ₹75k</Text>
          <TextInput
            style={styles.input}
            placeholder="₹ 25,000"
            placeholderTextColor="#868685"
            keyboardType="numeric"
            value={deduction80D}
            onChangeText={setDeduction80D}
          />

          <Text style={styles.label}>Section 80CCD(1B) (Additional NPS) — Max ₹50k</Text>
          <TextInput
            style={styles.input}
            placeholder="₹ 50,000"
            placeholderTextColor="#868685"
            keyboardType="numeric"
            value={nps80CCD}
            onChangeText={setNps80CCD}
          />

          <Text style={styles.label}>House Rent Allowance (HRA) Exemption</Text>
          <TextInput
            style={styles.input}
            placeholder="₹ 1,00,000"
            placeholderTextColor="#868685"
            keyboardType="numeric"
            value={hraExemption}
            onChangeText={setHraExemption}
          />

          <Text style={styles.label}>Home Loan Interest (Section 24b) — Max ₹2L</Text>
          <TextInput
            style={styles.input}
            placeholder="₹ 1,50,000"
            placeholderTextColor="#868685"
            keyboardType="numeric"
            value={homeLoanInterest}
            onChangeText={setHomeLoanInterest}
          />
        </View>

        {/* Results Card */}
        {gross > 0 && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>Comparison Summary</Text>
            
            <View style={styles.comparisonRow}>
              <View style={styles.comparisonCol}>
                <Text style={styles.comparisonLabel}>Old Regime</Text>
                <Text style={styles.taxValue}>{formatINR(totalTaxOld)}</Text>
                <Text style={styles.deductionSub}>
                  Deductions: {formatINR(totalDeductionsOld)}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.comparisonCol}>
                <Text style={styles.comparisonLabel}>New Regime</Text>
                <Text style={styles.taxValue}>{formatINR(totalTaxNew)}</Text>
                <Text style={styles.deductionSub}>
                  Std Deduction: {formatINR(stdDeductionNew)}
                </Text>
              </View>
            </View>

            <View style={styles.recommendationBanner}>
              <Ionicons 
                name="sparkles" 
                size={18} 
                color={Theme.colors.ink} 
                style={styles.sparkleIcon} 
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.recommendationTitle}>
                  Recommendation: {recommendedRegime}
                </Text>
                {difference > 0 && (
                  <Text style={styles.recommendationDesc}>
                    You save <Text style={{ fontWeight: '900' }}>{formatINR(difference)}</Text> by opting for the {recommendedRegime}.
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    padding: 4,
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9999,
  },
  toggleActive: {
    backgroundColor: '#9fe870',
  },
  toggleTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0e0f0c',
  },
  toggleTextInactive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#868685',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0e0f0c',
    marginBottom: 12,
  },
  desc: {
    fontSize: 11,
    color: '#868685',
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#454745',
    textTransform: 'uppercase',
    marginBottom: 6,
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
  resultsCard: {
    backgroundColor: '#9fe870',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0e0f0c',
    textAlign: 'center',
    marginBottom: 16,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  comparisonCol: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0e0f0c',
    opacity: 0.8,
    marginBottom: 4,
  },
  taxValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  deductionSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0e0f0c',
    opacity: 0.6,
    marginTop: 4,
  },
  divider: {
    width: 1.5,
    height: 50,
    backgroundColor: '#0e0f0c',
    opacity: 0.2,
  },
  recommendationBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#0e0f0c',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sparkleIcon: {
    marginRight: 8,
  },
  recommendationTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0e0f0c',
  },
  recommendationDesc: {
    fontSize: 11,
    color: '#454745',
    marginTop: 2,
    fontWeight: '600',
  },
});
