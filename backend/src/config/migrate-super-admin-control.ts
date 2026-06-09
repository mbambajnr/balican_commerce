import { query } from "./db";

export async function migrateSuperAdminControl() {
  // ── 1. Extend account_status enum ──
  await query(`
    ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'verification_required'
  `);
  await query(`
    ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'documents_submitted'
  `);
  await query(`
    ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'under_review'
  `);
  await query(`
    ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'changes_requested'
  `);
  await query(`
    ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'payment_suspended'
  `);
  await query(`
    ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'deactivated'
  `);

  // ── 2. Extend verification_status enum ──
  await query(`
    ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'not_started'
  `);
  await query(`
    ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'required'
  `);
  await query(`
    ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'submitted'
  `);
  await query(`
    ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'under_review'
  `);
  await query(`
    ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'changes_requested'
  `);

  // ── 3. Document status & type enums ──
  await query(`
    DO $$ BEGIN
      CREATE TYPE doc_status AS ENUM ('pending','approved','rejected','needs_reupload','expired');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await query(`
    DO $$ BEGIN
      CREATE TYPE doc_type AS ENUM (
        'business_registration','certificate_of_incorporation','tax_identification',
        'company_profile','director_or_owner_id','proof_of_address',
        'professional_license','insurance_certificate','portfolio_or_past_projects','other'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // ── 4. Verification documents table ──
  await query(`
    CREATE TABLE IF NOT EXISTS verification_documents (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      uploaded_by      UUID NOT NULL REFERENCES users(id),
      document_type    doc_type NOT NULL,
      file_name        VARCHAR(500) NOT NULL,
      storage_key      TEXT NOT NULL,
      mime_type        VARCHAR(100) NOT NULL,
      file_size        INTEGER NOT NULL,
      status           doc_status NOT NULL DEFAULT 'pending',
      admin_review_notes TEXT,
      rejection_reason   TEXT,
      reviewed_by      UUID REFERENCES users(id),
      reviewed_at      TIMESTAMPTZ,
      expires_at       DATE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_verif_docs_company ON verification_documents(company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_verif_docs_status  ON verification_documents(status)`);

  // ── 5. Audit logs table ──
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_user_id  UUID NOT NULL REFERENCES users(id),
      action         VARCHAR(100) NOT NULL,
      target_type    VARCHAR(100) NOT NULL,
      target_id      UUID,
      previous_value TEXT,
      new_value      TEXT,
      reason         TEXT,
      metadata       JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_admin   ON audit_logs(admin_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_target   ON audit_logs(target_type, target_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON audit_logs(action)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at DESC)`);

  // ── 6. Activity logs table ──
  await query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
      user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      action      VARCHAR(100) NOT NULL,
      description TEXT,
      metadata    JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_company ON activity_logs(company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_action   ON activity_logs(action)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created  ON activity_logs(created_at DESC)`);

  // ── 7. Subscription plans table ──
  await query(`
    CREATE TABLE IF NOT EXISTS plans (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name            VARCHAR(100) NOT NULL UNIQUE,
      display_name    VARCHAR(200) NOT NULL,
      description     TEXT,
      price_monthly   NUMERIC(10,2) NOT NULL DEFAULT 0,
      price_yearly    NUMERIC(10,2) NOT NULL DEFAULT 0,
      max_users       INTEGER DEFAULT 1,
      max_products    INTEGER DEFAULT 0,
      max_services    INTEGER DEFAULT 0,
      features        JSONB DEFAULT '[]',
      is_active       BOOLEAN NOT NULL DEFAULT true,
      sort_order      INTEGER DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed default plans
  await query(`
    INSERT INTO plans (name, display_name, description, price_monthly, price_yearly, max_users, max_products, max_services, features, sort_order)
    VALUES
      ('free',      'Free',       'Basic access for small teams', 0, 0, 3, 10, 5, '["Basic RFQ submission","Provider directory access","Email support"]'::jsonb, 1),
      ('starter',   'Starter',    'Growing businesses', 299, 2990, 10, 50, 20, '["All Free features","Company credit","Custom pricing","Priority support"]'::jsonb, 2),
      ('growth',    'Growth',     'Scaling enterprises', 999, 9990, 25, 200, 100, '["All Starter features","API access","Dedicated account manager","Advanced analytics"]'::jsonb, 3),
      ('enterprise','Enterprise', 'Large organizations', 2999, 29990, 100, 1000, 500, '["All Growth features","Custom integrations","SLA guarantee","Training & onboarding"]'::jsonb, 4)
    ON CONFLICT (name) DO NOTHING
  `);

  // ── 8. Company subscriptions table ──
  await query(`
    DO $$ BEGIN
      CREATE TYPE subscription_status AS ENUM (
        'free_active','trialing','active','past_due','grace_period','payment_suspended','cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS company_subscriptions (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id         UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      plan_id            UUID NOT NULL REFERENCES plans(id),
      status             subscription_status NOT NULL DEFAULT 'free_active',
      current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_period_end   TIMESTAMPTZ,
      trial_end_at       TIMESTAMPTZ,
      cancelled_at       TIMESTAMPTZ,
      payment_provider   VARCHAR(50),
      payment_provider_subscription_id VARCHAR(500),
      metadata           JSONB DEFAULT '{}',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_company_sub_status ON company_subscriptions(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_company_sub_plan   ON company_subscriptions(plan_id)`);

  // ── 9. Subscription events table ──
  await query(`
    CREATE TABLE IF NOT EXISTS subscription_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id UUID NOT NULL REFERENCES company_subscriptions(id) ON DELETE CASCADE,
      event_type      VARCHAR(100) NOT NULL,
      previous_status subscription_status,
      new_status      subscription_status,
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_sub_events_sub ON subscription_events(subscription_id)`);

  // ── 10. Auto-create free subscription for existing companies ──
  await query(`
    INSERT INTO company_subscriptions (company_id, plan_id, status)
    SELECT c.id, p.id, 'free_active'
    FROM companies c
    CROSS JOIN (SELECT id FROM plans WHERE name = 'free' LIMIT 1) p
    WHERE NOT EXISTS (SELECT 1 FROM company_subscriptions cs WHERE cs.company_id = c.id)
  `);

  // ── 11. Add status_change_reason to companies ──
  await query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS status_change_reason TEXT
  `);
  await query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES users(id)
  `);
  await query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ
  `);

  console.log("✓ Super admin control migration complete");
}

async function main() {
  console.log("Running super admin control migration…");
  await migrateSuperAdminControl();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
}
