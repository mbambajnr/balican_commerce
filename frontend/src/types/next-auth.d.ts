import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      role: "customer" | "sales" | "ops" | "admin" | "super_admin";
      credit_limit: string | null;
      outstanding_balance: string | null;
      store_credit: string | null;
      company_id: string | null;
      company_role: string | null;
      account_status: string | null;
      company_name: string | null;
      company_status: string | null;
    };
    token: string;
  }

  interface User {
    role: "customer" | "sales" | "ops" | "admin" | "super_admin";
    first_name: string;
    last_name: string;
    phone: string | null;
    credit_limit: string | null;
    outstanding_balance: string | null;
    store_credit: string | null;
    company_id: string | null;
    company_role: string | null;
    account_status: string | null;
    company_name: string | null;
    company_status: string | null;
    token: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "customer" | "sales" | "ops" | "admin" | "super_admin";
    first_name: string;
    last_name: string;
    phone: string | null;
    credit_limit: string | null;
    outstanding_balance: string | null;
    store_credit: string | null;
    company_id: string | null;
    company_role: string | null;
    account_status: string | null;
    company_name: string | null;
    company_status: string | null;
    token: string;
  }
}
