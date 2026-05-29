import { query } from "../config/db";
import argon2 from "argon2";

(async () => {
  const existing = await query("SELECT id FROM users WHERE email = 'demo@balican.com'");
  if (existing.rows.length > 0) {
    console.log('demo@balican.com already exists');
    console.log('Login: demo@balican.com / DemoPass123!');
    process.exit(0);
  }
  let companyId = (await query("SELECT id FROM companies WHERE email = 'demo-company@balican.com'")).rows[0]?.id;
  if (!companyId) {
    const company = await query(
      "INSERT INTO companies (name, email, status) VALUES ($1, $2, $3) RETURNING *",
      ['Demo Company', 'demo-company@balican.com', 'active']
    );
    companyId = company.rows[0].id;
  }
  const passwordHash = await argon2.hash('DemoPass123!', { type: argon2.argon2id });
  const user = await query(
    "INSERT INTO users (email, password_hash, first_name, last_name, role, company_id, company_role, account_status, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (email) DO UPDATE SET company_id = EXCLUDED.company_id RETURNING id, email, first_name, role, company_id",
    ['demo@balican.com', passwordHash, 'Demo', 'User', 'customer', companyId, 'buyer', 'active', '+233500000000']
  );
  console.log('Created user:', user.rows[0].email);
  console.log('Login: demo@balican.com');
  console.log('Password: DemoPass123!');
  process.exit(0);
})();
