import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { User } from "next-auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { email, password } = credentials as { email: string; password: string };
        try {
          const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return {
            id: data.user.id,
            email: data.user.email,
            name: `${data.user.first_name} ${data.user.last_name}`,
            first_name: data.user.first_name,
            last_name: data.user.last_name,
            phone: data.user.phone,
            role: data.user.role,
            credit_limit: data.user.credit_limit,
            outstanding_balance: data.user.outstanding_balance,
            store_credit: data.user.store_credit,
            company_id: data.user.company_id,
            company_role: data.user.company_role,
            account_status: data.user.account_status,
            company_name: data.user.company_name,
            company_status: data.user.company_status,
            is_provider: data.user.is_provider,
            verification_status: data.user.verification_status,
            token: data.token,
          } as User;
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        const u = user as any;
        token.id = u.id;
        token.role = u.role;
        token.name = u.name;
        token.first_name = u.first_name;
        token.last_name = u.last_name;
        token.phone = u.phone;
        token.credit_limit = u.credit_limit;
        token.outstanding_balance = u.outstanding_balance;
        token.store_credit = u.store_credit;
        token.company_id = u.company_id;
        token.company_role = u.company_role;
        token.account_status = u.account_status;
        token.company_name = u.company_name;
        token.company_status = u.company_status;
        token.is_provider = u.is_provider;
        token.verification_status = u.verification_status;
        token.token = u.token;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.first_name = token.first_name;
      session.user.last_name = token.last_name;
      session.user.phone = token.phone;
      session.user.credit_limit = token.credit_limit;
      session.user.outstanding_balance = token.outstanding_balance;
      session.user.store_credit = token.store_credit;
      session.user.company_id = token.company_id;
      session.user.company_role = token.company_role;
      session.user.account_status = token.account_status;
      session.user.company_name = token.company_name;
      session.user.company_status = token.company_status;
      session.user.is_provider = token.is_provider;
      session.user.verification_status = token.verification_status;
      session.token = token.token;
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
});
