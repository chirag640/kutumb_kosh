# KutumbKosh Setup and Access Guide

This guide describes the configuration and setup steps required to run the **KutumbKosh** monorepo, configure the Next.js admin panel, enable Gmail SMTP app password emails, and link the offline-first React Native mobile app with a Neon backup database.

---

## 1. Architectural Design Overview

KutumbKosh is designed to keep a family's financial sheets completely private. 

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             MOBILE APP (Expo)                            │
│                                                                          │
│  [User Input Data] ──► [AES-256-GCM Local Encryption]                    │
│                                │                                         │
│                                ▼                                         │
│                      [Local SQLite Database]                             │
│                                │                                         │
│                                ▼ (Push Encrypted Blobs)                  │
│                      [User's Own Private Neon DB]                        │
└──────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ (No access to balances/passwords)
┌──────────────────────────────────────────────────────────────────────────┐
│                            ADMIN PANEL (Next.js)                         │
│                                                                          │
│  [User Registration] ──► [Admin Approves] ──► [Real-time SMTP Email]     │
│                                                (Sends Generated Password)│
└──────────────────────────────────────────────────────────────────────────┘
```

*   **Offline-First & Local Storage**: Data is encrypted using AES-256-GCM locally inside a SQLite file on the device.
*   **Zero-Knowledge Admin**: The admin panel database stores only user metadata (name, email, registration status). It has **no access** to master passwords, connection strings, or balance sheets.
*   **App Passwords for Gmail**: When the administrator approves a pending user, the Next.js server derives a strong master password, emails it using Nodemailer SMTP, and reveals it once on the admin interface for secure reference.

---

## 2. Setting Up the Database & Gmail SMTP Credentials

### Step 2.1: Setting up an Admin Database
1. Go to [Neon.tech](https://neon.tech) (or Supabase) and create a free PostgreSQL project (name it e.g., `kutumbkosh-admin`).
2. Copy the Connection String from the Dashboard. It looks like:
   `postgresql://[user]:[password]@[host]/[dbname]?sslmode=require`

### Step 2.2: Generating a Gmail SMTP App Password
To allow the admin server to send welcome emails securely from a Gmail account:
1. Log in to the Google Account you wish to use to send notifications.
2. Go to **Google Account Settings** -> **Security**.
3. Under *How you sign in to Google*, ensure **2-Step Verification** is turned ON.
4. Click on **2-Step Verification** and scroll down to the bottom to find **App passwords**.
5. Input an app name (e.g., `KutumbKosh Admin`) and click **Create**.
6. Google will generate a unique **16-character access passcode** (e.g., `abcd efgh ijkl mnop`).
7. Copy this code securely; this will be used as `SMTP_PASS` in your environment config.

---

## 3. Local Setup & Configuration

### Step 3.1: Install Dependencies
Run the install script from the monorepo root to link workspace packages:
```bash
npm install --legacy-peer-deps
```

### Step 3.2: Configure Environment Variables
Create the `.env` configuration file in `apps/admin/.env` (using `apps/admin/.env.example` as a template):
```bash
# apps/admin/.env

# Admin Metadata Database URL (copied in Step 2.1)
DATABASE_URL="postgresql://[user]:[password]@[host]/[dbname]?sslmode=require"

# NextAuth Secret (random string used to secure admin cookies)
NEXTAUTH_SECRET="some-random-32-character-string"
NEXTAUTH_URL="http://localhost:3000"

# Admin Dashboard Access Details
ADMIN_EMAIL="admin@kutumbkosh.local"
ADMIN_PASSWORD_HASH="$2a$10$S9Gz5G4YI7l64sUq9Xp5nukzB2c8R71pZJ/u4wD8H7V22u9U1N1P2" # bcrypt hash of 'admin123'

# Gmail SMTP Configuration (from Step 2.2)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="your-gmail-account@gmail.com"
SMTP_PASS="xxxx xxxx xxxx xxxx" # 16-character Google App Password
```

### Step 3.3: Push Schema to PostgreSQL
Run the schema sync to create the `admin_users` and `audit_log` tables inside the admin database:
```bash
npm run db:push --workspace=admin
```

---

## 4. Accessing the Admin Panel

### Step 4.1: Start the Local Servers
To run both apps concurrently:
```bash
npm run dev
```
To run only the Next.js admin panel:
```bash
npm run dev --workspace=admin
```
The admin panel website will start at: **`http://localhost:3000`**

### Step 4.2: Registration Flow
1. Go to `http://localhost:3000`. You will see the public landing and access request form.
2. Fill out the request details:
   *   **Full Name**: Rajesh Patel
   *   **Email**: user@example.com
   *   **Family Name**: Patel Family
   *   **Estimated Members**: 5
3. Click **Request Access Code** to submit a registration request (saved with a status of `pending`).

### Step 4.3: Logging in as the Administrator
1. Navigate to the Admin login page at: **`http://localhost:3000/login`**
2. Input the default admin credentials (unless customized in `.env`):
   *   **Email**: `admin@kutumbkosh.local`
   *   **Password**: `admin123`
3. Click **Sign In**.

### Step 4.4: Approving Requests and Revealing Password
1. Navigate to the **User Approvals** section in the admin sidebar.
2. You will see a list of registration requests. Locate the request you just submitted under the `pending` filter.
3. Click **Approve**.
4. The system will:
   *   Generate a secure, random 12-character master password.
   *   Initiate a connection to `smtp.gmail.com` using the Google App Password and send the welcome instructions.
   *   Open a secure dialog overlay containing the generated master password. Note this down or copy it to the clipboard as it is **not saved anywhere** once closed.

---

## 5. Mobile App Setup & Backup Integration

Once a user receives their welcome email:

### Step 5.1: Database Setup (for the family)
1. The user must register their own free PostgreSQL database on [Neon.tech](https://neon.tech).
2. Create a project named `KutumbKosh`.
3. Copy the connection URI from the dashboard:
   `postgresql://[user]:[password]@[host]/[dbname]?sslmode=require`

### Step 5.2: Launch and First Setup
1. Launch the Expo application:
   ```bash
   npm run android  # or iOS / start
   ```
2. On onboarding, input:
   *   Approved email address
   *   Welcome master password (from email/admin screen)
   *   The private PostgreSQL database URL (copied in Step 5.1)
3. The app will verify credentials, derive security encryption keys via PBKDF2, and run schemas on the private Neon database.
4. Setup a 6-digit PIN to enable daily lock screen unlocking. The Derived Encryption Key is encrypted via a key derived from the PIN and saved to the SecureStore.

---

## 6. Security Enforcement Guidelines

1. **Password Safety**: The master password is never saved in the database or `AsyncStorage` / `SecureStore`. The derived key resides solely in the Zustand in-memory state.
2. **Auto-Lock**: The app will lock and clear its in-memory key whenever it enters the background state.
3. **Decryption Limits**: Biometric credentials unlock access keys only by reading the hardware-backed secure storage.
