import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

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

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
          console.error("[auth] ADMIN_EMAIL or ADMIN_PASSWORD env var is not set.");
          return null;
        }

        if (credentials.email !== adminEmail) {
          console.warn("[auth] Login failed: email mismatch.");
          return null;
        }

        if (credentials.password !== adminPassword) {
          console.warn(`[auth] Login failed: password mismatch for ${adminEmail}.`);
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
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
