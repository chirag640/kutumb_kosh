import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const rawEmail = process.env.ADMIN_EMAIL;
        const rawPassword = process.env.ADMIN_PASSWORD || "admin123";

        if (!rawEmail) {
          console.error("ADMIN_EMAIL is not set in environment variables");
          return null;
        }

        const adminEmail = rawEmail.replace(/^['"]|['"]$/g, '');
        const adminPassword = rawPassword.replace(/^['"]|['"]$/g, '');

        if (credentials.email !== adminEmail) {
          console.warn(`Admin login failed: Email mismatch. Expected: "${adminEmail}", got: "${credentials.email}"`);
          return null;
        }

        if (credentials.password !== adminPassword) {
          console.warn(`Admin login failed: Password mismatch for ${adminEmail}.`);
          return null;
        }

        return {
          id: "admin",
          email: adminEmail,
          name: "Administrator",
          role: "admin",
        };
      }
    })
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
});
