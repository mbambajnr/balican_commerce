import { Router, Response } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { config } from "../config";
import { query, transaction } from "../config/db";
import { validate } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";
import { authLimiter } from "../middleware/security";
import { notifyAndLog } from "../services/notifications";
import { sendEmail } from "../services/email";
import { createAuthSession, revokeAuthSession } from "../services/auth-session";

const router = Router();
router.use(["/login", "/admin-login", "/register", "/admin-register"], authLimiter);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  // B2B company fields
  companyName: z.string().min(1, "Company name is required"),
  companyType: z.enum(["buyer", "supplier", "service_provider", "both"]).optional(),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  taxId: z.string().optional(),
  businessRegistrationNumber: z.string().optional(),
  contactPersonName: z.string().optional(),
  contactPersonEmail: z.string().optional(),
  contactPersonPhone: z.string().optional(),
  requestedPaymentTerms: z.string().optional(),
  // UTM tracking
  utm_source: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  referrer_url: z.string().max(2000).optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const adminRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  adminKey: z.string().min(1, "Admin key is required"),
});

function sessionRequest(req: { ip?: string; get(name: string): string | undefined }) {
  return { ip: req.ip || null, userAgent: req.get("user-agent") || null };
}

router.post("/register", validate(registerSchema), async (req, res: Response) => {
  try {
    const {
      email, password, firstName, lastName, phone,
      companyName, companyType, businessType, industry, address, city, state,
      taxId, businessRegistrationNumber,
      contactPersonName, contactPersonEmail, contactPersonPhone,
      requestedPaymentTerms,
      utm_source, utm_campaign, utm_medium, referrer_url,
    } = req.body;

    // Map companyType to is_provider, is_buyer, and company_type
    const companyTypeEnum = (companyType === "both" ? "both_supplier_and_service_provider"
      : companyType === "supplier" ? "supplier"
      : companyType === "service_provider" ? "service_provider"
      : "buyer") as string;
    const isProvider = companyType === "supplier" || companyType === "service_provider" || companyType === "both";
    const isBuyer = companyType === "buyer" || companyType === "both" || !companyType;
    const verificationStatus = isProvider ? "pending" : "approved";

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const { company, user } = await transaction(async (client) => {
      const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
      if (existing.rows.length > 0) {
        const duplicateError = new Error("Email already registered") as Error & { code?: string };
        duplicateError.code = "EMAIL_EXISTS";
        throw duplicateError;
      }

      const groupResult = await client.query(
        `SELECT id FROM customer_groups WHERE is_default = true LIMIT 1`
      );
      const defaultGroupId = groupResult.rows[0]?.id || null;

      const companyResult = await client.query(
        `INSERT INTO companies (name, business_type, industry, email, phone,
          address, city, state, tax_id, business_registration_number,
          contact_person_name, contact_person_email, contact_person_phone,
          requested_payment_terms, customer_group_id, status,
          company_type, is_provider, is_buyer, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active',
           $16::company_type, $17, $18, $19::verification_status)
         RETURNING id, name, status`,
        [companyName, businessType || null, industry || null, email, phone || null,
         address || null, city || null, state || null, taxId || null, businessRegistrationNumber || null,
         contactPersonName || `${firstName} ${lastName}`, contactPersonEmail || email, contactPersonPhone || phone || null,
         requestedPaymentTerms || null, defaultGroupId,
         companyTypeEnum, isProvider, isBuyer, verificationStatus]
      );
      const company = companyResult.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone,
          company_id, company_role, account_status, company_name, tax_id, business_registration_number,
          utm_source, utm_campaign, utm_medium, referrer_url)
         VALUES ($1, $2, $3, $4, $5, $6, 'company_admin', 'active', $7, $8, $9,
           $10, $11, $12, $13)
         RETURNING id, email, first_name, last_name, phone, role, company_id, created_at`,
        [email, passwordHash, firstName, lastName, phone || null,
         company.id, companyName, taxId || null, businessRegistrationNumber || null,
         utm_source || null, utm_campaign || null, utm_medium || null, referrer_url || null]
      );

      return { company, user: userResult.rows[0] };
    });

    // Side effects run only after the database transaction commits and never
    // change the registration response if an external service is unavailable.
    void Promise.allSettled([notifyAndLog({
      recipientEmail: email,
      recipientName: `${firstName} ${lastName}`,
      subject: "Registration Received – Bali-Can Limited",
      body: `Hi ${firstName}, thank you for registering ${companyName}. Your company account is pending review and will be activated shortly.`,
      eventType: "company.registered",
      entityType: "company",
      entityId: company.id,
      performedBy: user.id,
    }), sendEmail({
      to: email,
      subject: "Welcome to Bali-Can Limited",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #061633 0%, #1848CC 100%); padding: 32px; text-align: center;">
            <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">Welcome to Bali-Can Limited</h1>
          </div>
          <div style="padding: 32px; background: #FFFFFF;">
            <p style="color: #111827; font-size: 16px;">Dear ${firstName} ${lastName},</p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              Thank you for registering <strong>${companyName}</strong> with Bali-Can Limited.
            </p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              Your company account is currently <strong style="color: #D4AF37;">pending review</strong>.
              Our team will review your application and activate your account shortly.
            </p>
            <div style="background: #F0F4FF; border-left: 4px solid #1848CC; padding: 16px; margin: 24px 0;">
              <p style="color: #374151; font-size: 13px; line-height: 1.5; margin: 0;">
                <strong>What happens next?</strong><br/>
                Once your account is approved, you will have access to our full B2B catalog,
                company-specific pricing, and the ability to submit RFQs and place orders.
              </p>
            </div>
            <p style="color: #374151; font-size: 14px;">
              If you have any questions, please contact our sales team.
            </p>
            <p style="color: #374151; font-size: 14px;">
              Best regards,<br/>
              <strong>Bali-Can Limited</strong>
            </p>
          </div>
          <div style="background: #F8FAFC; padding: 16px; text-align: center; border-top: 1px solid #E2E8F0;">
            <p style="color: #64748B; font-size: 12px; margin: 0;">
              Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana
            </p>
          </div>
        </div>
      `,
    })]);

    res.status(201).json({ user, company });
  } catch (err: any) {
    if (err?.code === "EMAIL_EXISTS" || err?.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/admin-register", validate(adminRegisterSchema), async (req, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone, adminKey } = req.body;

    if (!config.adminSecretKey) {
      return res.status(403).json({ error: "Admin registration is disabled: ADMIN_SECRET_KEY not configured" });
    }
    if (adminKey !== config.adminSecretKey) {
      return res.status(403).json({ error: "Invalid admin secret key" });
    }

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       RETURNING id, email, first_name, last_name, phone, role, created_at`,
      [email, passwordHash, firstName, lastName, phone || null]
    );

    const user = result.rows[0];
    await notifyAndLog({
      recipientEmail: email,
      recipientName: `${firstName} ${lastName}`,
      subject: "Welcome to Bali-Can Limited",
      body: `Hi ${firstName}, welcome to Bali-Can Limited. Your account has been created successfully.`,
      eventType: "user.registered",
      entityType: "user",
      entityId: user.id,
      performedBy: user.id,
    });

    // Send welcome email
    sendEmail({
      to: email,
      subject: "Welcome to Bali-Can Limited — Admin Access",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #061633 0%, #1848CC 100%); padding: 32px; text-align: center;">
            <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">Admin Account Created</h1>
          </div>
          <div style="padding: 32px; background: #FFFFFF;">
            <p style="color: #111827; font-size: 16px;">Dear ${firstName} ${lastName},</p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              Your admin account for Bali-Can Limited has been created successfully.
            </p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              You now have access to the admin dashboard where you can manage products,
              orders, quotations, companies, and more.
            </p>
            <p style="color: #374151; font-size: 14px;">
              Best regards,<br/>
              <strong>Bali-Can Limited</strong>
            </p>
          </div>
          <div style="background: #F8FAFC; padding: 16px; text-align: center; border-top: 1px solid #E2E8F0;">
            <p style="color: #64748B; font-size: 12px; margin: 0;">
              Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana
            </p>
          </div>
        </div>
      `,
    }).catch(() => {});

    res.status(201).json({ user });
  } catch (err) {
    console.error("Admin register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/admin-login", validate(loginSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      "SELECT id, email, password_hash, first_name, last_name, phone, role, account_status, created_at FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    if (user.role !== "admin" && user.role !== "super_admin") {
      return res.status(403).json({ error: "Access denied. Admin credentials required." });
    }

    try {
      const isValid = await argon2.verify(user.password_hash, password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
    } catch {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.account_status && user.account_status !== "active") {
      return res.status(403).json({ error: "This admin account is suspended." });
    }
    const token = await createAuthSession(user.id, sessionRequest(req));

    const { password_hash, ...safeUser } = user;

    // Send login notification email (fire-and-forget)
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    sendEmail({
      to: email,
      subject: "New Admin Login to Bali-Can",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #061633 0%, #1848CC 100%); padding: 24px; text-align: center;">
            <h1 style="color: #FFFFFF; margin: 0; font-size: 20px;">Admin Login Alert</h1>
          </div>
          <div style="padding: 32px; background: #FFFFFF;">
            <p style="color: #111827; font-size: 16px;">Dear ${user.first_name} ${user.last_name},</p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              An admin login was detected on your Bali-Can Limited account.
            </p>
            <div style="background: #FFF3E0; border-left: 4px solid #D4AF37; padding: 16px; margin: 24px 0;">
              <p style="color: #374151; font-size: 13px; line-height: 1.5; margin: 0;">
                <strong>Login Details</strong><br/>
                Time: ${new Date().toLocaleString("en-GH")}<br/>
                IP Address: ${ip}
              </p>
            </div>
            <p style="color: #64748B; font-size: 13px; line-height: 1.5;">
              If this was you, you can ignore this email. If you did not authorize this login,
              please change your password immediately and contact support.
            </p>
          </div>
          <div style="background: #F8FAFC; padding: 16px; text-align: center; border-top: 1px solid #E2E8F0;">
            <p style="color: #64748B; font-size: 12px; margin: 0;">
              Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana
            </p>
          </div>
        </div>
      `,
    }).catch(() => {});

    res.json({ user: safeUser, token });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/login", validate(loginSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await query(
       `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone,
               u.role, u.company_id, u.company_role, u.account_status,
               u.credit_limit, u.outstanding_balance, u.store_credit,
               u.created_at,
               c.name as company_name, c.status as company_status,
               c.is_provider, c.verification_status
        FROM users u
        LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    try {
      const isValid = await argon2.verify(user.password_hash, password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
    } catch {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.account_status !== "active") {
      return res.status(403).json({ error: "Your account is not active. Please contact support." });
    }
    const token = await createAuthSession(user.id, sessionRequest(req));

    const { password_hash, ...safeUser } = user;

    // Send login notification email (fire-and-forget)
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    sendEmail({
      to: email,
      subject: "New Login to Your Bali-Can Account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #061633 0%, #1848CC 100%); padding: 24px; text-align: center;">
            <h1 style="color: #FFFFFF; margin: 0; font-size: 20px;">Account Activity</h1>
          </div>
          <div style="padding: 32px; background: #FFFFFF;">
            <p style="color: #111827; font-size: 16px;">Dear ${user.first_name} ${user.last_name},</p>
            <p style="color: #374151; font-size: 14px; line-height: 1.6;">
              A new login was detected on your Bali-Can Limited account.
            </p>
            <div style="background: #F0F4FF; border-left: 4px solid #1848CC; padding: 16px; margin: 24px 0;">
              <p style="color: #374151; font-size: 13px; line-height: 1.5; margin: 0;">
                <strong>Login Details</strong><br/>
                Time: ${new Date().toLocaleString("en-GH")}<br/>
                IP Address: ${ip}
              </p>
            </div>
            <p style="color: #64748B; font-size: 13px; line-height: 1.5;">
              If this was you, you can ignore this email. If you did not log in,
              please contact our support team immediately.
            </p>
          </div>
          <div style="background: #F8FAFC; padding: 16px; text-align: center; border-top: 1px solid #E2E8F0;">
            <p style="color: #64748B; font-size: 12px; margin: 0;">
              Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana
            </p>
          </div>
        </div>
      `,
    }).catch(() => {});

    res.json({ user: safeUser, token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
       `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role,
               u.credit_limit, u.outstanding_balance, u.store_credit,
               u.company_id, u.company_role, u.account_status,
               u.created_at,
               c.name as company_name, c.status as company_status,
               c.business_type, c.customer_group_id,
               c.is_provider
        FROM users u
        LEFT JOIN companies c ON u.company_id = c.id
        WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.post("/logout", authenticate, async (req: AuthRequest, res: Response) => {
  await revokeAuthSession(req.sessionId!);
  res.json({ success: true });
});

router.put("/profile", authenticate, validate(z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (firstName) {
      fields.push(`first_name = $${paramIndex++}`);
      values.push(firstName);
    }
    if (lastName) {
      fields.push(`last_name = $${paramIndex++}`);
      values.push(lastName);
    }
    if (phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.userId);

    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, phone, role, created_at`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
