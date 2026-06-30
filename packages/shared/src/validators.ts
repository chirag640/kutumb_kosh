/**
 * Shared Zod validation schemas for KutumbKosh.
 *
 * Provides runtime validation for all entity types shared between
 * mobile and admin apps. Used for API request/response validation,
 * form validation, and data integrity checks.
 */

import { z } from 'zod';

// ─── Common Primitives ──────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const amountSchema = z.number().min(0).max(100_000_000); // max 10 crore

// ─── User / Auth ────────────────────────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

export const masterPasswordSchema = z
  .string()
  .regex(/^KK-[A-HJ-NP-Za-hj-km-np-z2-9@#$%]{12}$/, 'Invalid master password format');

export const userStatusSchema = z.enum(['pending', 'approved', 'suspended', 'rejected']);

// ─── Family Member ──────────────────────────────────────────────────────────

export const relationshipSchema = z.enum([
  'Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter',
  'Brother', 'Sister', 'Other',
]);

export const familyMemberSchema = z.object({
  localId: uuidSchema,
  name: z.string().min(1, 'Name is required').max(100),
  relationship: relationshipSchema,
  dateOfBirth: dateSchema,
  mobile: z.string().min(10).max(15),
  aadhaarAvailable: z.boolean(),
  panAvailable: z.boolean(),
  bloodGroup: z.string().max(5),
  photo: z.string().optional(),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FamilyMemberInput = z.infer<typeof familyMemberSchema>;

// ─── Income Entry ───────────────────────────────────────────────────────────

export const incomeSourceSchema = z.enum([
  'Salary', 'Business', 'Farming', 'Rent', 'Interest/FD', 'Pension', 'Other',
]);

export const incomeEntrySchema = z.object({
  localId: uuidSchema,
  date: dateSchema,
  memberId: uuidSchema,
  source: incomeSourceSchema,
  amount: amountSchema,
  isRecurring: z.boolean(),
  recurringDay: z.number().min(1).max(28).optional(),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IncomeEntryInput = z.infer<typeof incomeEntrySchema>;

// ─── Expense Entry ──────────────────────────────────────────────────────────

export const expenseCategorySchema = z.enum([
  'Food', 'Household', 'Utilities', 'Fuel', 'Vehicle',
  'Healthcare', 'Education', 'EMI', 'Insurance', 'Farming',
  'Business', 'Travel', 'Entertainment', 'Shopping', 'Miscellaneous',
]);

export const paymentMethodSchema = z.enum([
  'Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Cheque',
]);

export const expenseEntrySchema = z.object({
  localId: uuidSchema,
  date: dateSchema,
  category: expenseCategorySchema,
  subcategory: z.string().max(50),
  amount: amountSchema,
  paymentMethod: paymentMethodSchema,
  paidByMemberId: uuidSchema,
  isRecurring: z.boolean(),
  recurringDay: z.number().min(1).max(28).optional(),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ExpenseEntryInput = z.infer<typeof expenseEntrySchema>;

// ─── Bank Account ───────────────────────────────────────────────────────────

export const bankAccountSchema = z.object({
  localId: uuidSchema,
  bankName: z.string().min(1).max(100),
  accountType: z.enum(['Savings', 'Current', 'Salary', 'Joint', 'NRI']),
  ownerMemberId: uuidSchema,
  accountNumber: z.string().min(4).max(20),
  balance: z.number(),
  lastUpdated: z.string(),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── LIC Policy ─────────────────────────────────────────────────────────────

export const licPolicySchema = z.object({
  localId: uuidSchema,
  policyHolderMemberId: uuidSchema,
  policyNumber: z.string().min(1).max(50),
  planName: z.string().min(1).max(100),
  sumAssured: amountSchema,
  premiumAmount: amountSchema,
  frequency: z.enum(['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']),
  nextDueDate: dateSchema,
  maturityDate: dateSchema,
  status: z.enum(['Active', 'Paid-Up', 'Lapsed', 'Matured']),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Insurance Policy ───────────────────────────────────────────────────────

export const insurancePolicySchema = z.object({
  localId: uuidSchema,
  policyHolderMemberId: uuidSchema,
  insuranceType: z.enum([
    'Health', 'Term Life', 'Vehicle', 'Home', 'Crop/Farming',
    'Personal Accident', 'Travel',
  ]),
  company: z.string().min(1).max(100),
  policyNumber: z.string().min(1).max(50),
  coverageAmount: amountSchema,
  premium: amountSchema,
  renewalDate: dateSchema,
  status: z.enum(['Active', 'Expired', 'Cancelled']),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Loan ───────────────────────────────────────────────────────────────────

export const loanSchema = z.object({
  localId: uuidSchema,
  loanType: z.enum([
    'Home Loan', 'Car Loan', 'Personal Loan', 'Gold Loan',
    'Kisan Credit Card', 'Business Loan', 'Education Loan', 'Other',
  ]),
  lender: z.string().min(1).max(100),
  borrowerMemberId: uuidSchema,
  originalAmount: amountSchema,
  outstandingAmount: amountSchema,
  emi: amountSchema,
  interestRate: z.number().min(0).max(100),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.enum(['Active', 'Closed', 'Restructured']),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Important Document ─────────────────────────────────────────────────────

export const documentTypeSchema = z.enum([
  'Aadhaar', 'PAN', 'Passport', 'Driving License', 'Vehicle RC',
  'Vehicle Insurance', 'LIC Policy', 'Health Insurance', 'Term Insurance',
  'Property Documents', 'Bank Passbook', 'Ration Card', 'Voter ID',
  'Birth Certificate', 'Marriage Certificate', 'Other',
]);

export const importantDocumentSchema = z.object({
  localId: uuidSchema,
  holderMemberId: uuidSchema,
  documentType: documentTypeSchema,
  documentNumber: z.string().min(1).max(50),
  issueDate: dateSchema.optional(),
  expiryDate: dateSchema.optional(),
  neverExpires: z.boolean(),
  physicalLocation: z.string().max(200).optional(),
  digitalCopy: z.string().optional(),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── FD/RD Entry ────────────────────────────────────────────────────────────

export const fdrdEntrySchema = z.object({
  localId: uuidSchema,
  type: z.enum(['FD', 'RD']),
  bank: z.string().min(1).max(100),
  holderMemberId: uuidSchema,
  principal: amountSchema,
  monthlyAmount: amountSchema.optional(),
  interestRate: z.number().min(0).max(100),
  startDate: dateSchema,
  maturityDate: dateSchema,
  maturityAmount: amountSchema,
  status: z.enum(['Active', 'Matured', 'Broken']),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Property ───────────────────────────────────────────────────────────────

export const propertySchema = z.object({
  localId: uuidSchema,
  name: z.string().min(1).max(100),
  type: z.enum(['House', 'Agricultural Land', 'Plot', 'Commercial', 'Other']),
  ownerMemberId: uuidSchema,
  location: z.string().min(1).max(200),
  area: z.string().max(50),
  purchaseDate: dateSchema.optional(),
  purchasePrice: amountSchema.optional(),
  currentValue: amountSchema.optional(),
  linkedLoanLocalId: uuidSchema.optional(),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Savings Goal ───────────────────────────────────────────────────────────

export const savingsGoalSchema = z.object({
  localId: uuidSchema,
  title: z.string().min(1).max(100),
  targetAmount: amountSchema,
  savedAmount: amountSchema,
  monthlyContribution: amountSchema,
  targetDate: dateSchema,
  status: z.enum(['Active', 'Achieved', 'Paused']),
  notes: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Admin API ──────────────────────────────────────────────────────────────

export const loginRequestSchema = z.object({
  email: emailSchema,
  masterPassword: z.string().min(1, 'Master password is required'),
});

export const otpRequestSchema = z.object({
  email: emailSchema,
});

export const otpVerifySchema = z.object({
  email: emailSchema,
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const uploadDbUrlSchema = z.object({
  email: emailSchema,
  encryptedDbUrl: z.string().max(4096, 'Encrypted DB URL too long'),
});

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Safely validate data against a Zod schema.
 * Returns { success, data, errors } instead of throwing.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: string[];
} {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
