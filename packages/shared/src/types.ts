// All financial data models — used by both mobile and any future web app

export interface FamilyMember {
  id?: number;
  localId: string;           // UUID
  name: string;
  relationship: 'Self' | 'Spouse' | 'Father' | 'Mother' | 'Son' | 'Daughter' | 'Brother' | 'Sister' | 'Other';
  dateOfBirth: string;       // YYYY-MM-DD
  mobile: string;
  aadhaarAvailable: boolean;
  panAvailable: boolean;
  bloodGroup: string;
  photo?: string;            // base64 compressed
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeEntry {
  id?: number;
  localId: string;
  date: string;              // YYYY-MM-DD
  memberId: string;          // localId of FamilyMember
  source: 'Salary' | 'Business' | 'Farming' | 'Rent' | 'Interest/FD' | 'Pension' | 'Other';
  amount: number;
  isRecurring: boolean;
  recurringDay?: number;     // day of month for recurring
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseEntry {
  id?: number;
  localId: string;
  date: string;
  category: ExpenseCategory;
  subcategory: string;
  amount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Debit Card' | 'Credit Card' | 'Net Banking' | 'Cheque';
  paidByMemberId: string;
  isRecurring: boolean;
  recurringDay?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'Food' | 'Household' | 'Utilities' | 'Fuel' | 'Vehicle'
  | 'Healthcare' | 'Education' | 'EMI' | 'Insurance' | 'Farming'
  | 'Business' | 'Travel' | 'Entertainment' | 'Shopping' | 'Miscellaneous';

export const EXPENSE_SUBCATEGORIES: Record<ExpenseCategory, string[]> = {
  Food: ['Groceries', 'Restaurant', 'Milk', 'Vegetables', 'Fruits', 'Other'],
  Household: ['Rent', 'Maintenance', 'Furniture', 'Cleaning', 'Other'],
  Utilities: ['Electricity', 'Water', 'Gas', 'Internet', 'Mobile Recharge', 'Other'],
  Fuel: ['Petrol', 'Diesel', 'CNG', 'Other'],
  Vehicle: ['Service', 'Repair', 'Tyres', 'Accessories', 'Other'],
  Healthcare: ['Doctor', 'Medicine', 'Lab Tests', 'Hospital', 'Other'],
  Education: ['School Fees', 'Tuition', 'Books', 'Stationery', 'Uniform', 'Other'],
  EMI: ['Home Loan', 'Car Loan', 'Personal Loan', 'Other'],
  Insurance: ['LIC Premium', 'Health', 'Vehicle', 'Term', 'Other'],
  Farming: ['Seeds', 'Fertilizer', 'Labour', 'Equipment', 'Water', 'Other'],
  Business: ['Raw Material', 'Labour', 'Rent', 'Utilities', 'Other'],
  Travel: ['Transport', 'Hotel', 'Food', 'Sightseeing', 'Other'],
  Entertainment: ['OTT', 'Movies', 'Events', 'Subscriptions', 'Other'],
  Shopping: ['Clothing', 'Electronics', 'Gifts', 'Footwear', 'Other'],
  Miscellaneous: ['Donations', 'Festival', 'Medical Emergency', 'Other'],
};

export interface BankAccount {
  id?: number;
  localId: string;
  bankName: string;
  accountType: 'Savings' | 'Current' | 'Salary' | 'Joint' | 'NRI';
  ownerMemberId: string;
  last4Digits: string;
  balance: number;
  lastUpdated: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LICPolicy {
  id?: number;
  localId: string;
  policyHolderMemberId: string;
  policyNumber: string;
  planName: string;
  sumAssured: number;
  premiumAmount: number;
  frequency: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';
  nextDueDate: string;
  maturityDate: string;
  status: 'Active' | 'Paid-Up' | 'Lapsed' | 'Matured';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsurancePolicy {
  id?: number;
  localId: string;
  policyHolderMemberId: string;
  insuranceType: 'Health' | 'Term Life' | 'Vehicle' | 'Home' | 'Crop/Farming' | 'Personal Accident' | 'Travel';
  company: string;
  policyNumber: string;
  coverageAmount: number;
  premium: number;
  renewalDate: string;
  status: 'Active' | 'Expired' | 'Cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id?: number;
  localId: string;
  loanType: 'Home Loan' | 'Car Loan' | 'Personal Loan' | 'Gold Loan' | 'Kisan Credit Card' | 'Business Loan' | 'Education Loan' | 'Other';
  lender: string;
  borrowerMemberId: string;
  originalAmount: number;
  outstandingAmount: number;
  emi: number;
  interestRate: number;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Closed' | 'Restructured';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportantDocument {
  id?: number;
  localId: string;
  holderMemberId: string;
  documentType: 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License' | 'Vehicle RC' | 'Vehicle Insurance' | 'LIC Policy' | 'Health Insurance' | 'Term Insurance' | 'Property Documents' | 'Bank Passbook' | 'Ration Card' | 'Voter ID' | 'Birth Certificate' | 'Marriage Certificate' | 'Other';
  documentNumber: string;   // stored encrypted, displayed masked
  issueDate?: string;
  expiryDate?: string;
  neverExpires: boolean;
  physicalLocation?: string;
  digitalCopy?: string;     // base64 image
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FDRDEntry {
  id?: number;
  localId: string;
  type: 'FD' | 'RD';
  bank: string;
  holderMemberId: string;
  principal: number;
  monthlyAmount?: number;
  interestRate: number;
  startDate: string;
  maturityDate: string;
  maturityAmount: number;
  status: 'Active' | 'Matured' | 'Broken';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id?: number;
  localId: string;
  name: string;
  type: 'House' | 'Agricultural Land' | 'Plot' | 'Commercial' | 'Other';
  ownerMemberId: string;
  location: string;
  area: string;
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  linkedLoanLocalId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoal {
  id?: number;
  localId: string;
  title: string;
  targetAmount: number;
  savedAmount: number;
  monthlyContribution: number;
  targetDate: string;
  status: 'Active' | 'Achieved' | 'Paused';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Sync types
export type SyncStatus = 'pending' | 'synced' | 'conflict';

export interface SyncBatch {
  deviceId: string;
  syncedAt: string;
  appVersion: string;
  tables: {
    [tableName: string]: {
      upsert: Array<{ localId: string; iv: string; data: string; indexFields: Record<string, unknown> }>;
      softDelete: string[];
    };
  };
}
