import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createLogger } from "@/lib/logger";
import { getEnv } from "@/lib/env";

const log = createLogger("auth");

// Session timeout: 24 hours (in seconds)
const SESSION_MAX_AGE = 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const { ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword } = getEnv();

        if (!adminEmail || !adminPassword) {
          log.error("ADMIN_EMAIL or ADMIN_PASSWORD env var is not set");
          return null;
        }

        if (credentials.email !== adminEmail) {
          log.warn("Login failed: email mismatch", { email: credentials.email as string });
          return null;
        }

        if (credentials.password !== adminPassword) {
          log.warn("Login failed: password mismatch", { email: adminEmail });
          return null;
        }

        return {
          id: "admin",
          email: adminEmail,
          name: "Administrator",
          role: "admin",
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string })?.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
