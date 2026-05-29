import { Router, Response } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { notifyAndLog } from "../services/notifications";

const router = Router();

// ─── Lead Stages ───────────────────────────────────────────────────

router.get("/stages", authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query("SELECT * FROM lead_stages ORDER BY position");
    res.json({ stages: result.rows });
  } catch (err) {
    console.error("Get stages error:", err);
    res.status(500).json({ error: "Failed to fetch stages" });
  }
});

router.post("/stages", authenticate, requireAdmin, validate(z.object({
  name: z.string().min(1),
  position: z.number().int().min(0).optional(),
  color: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { name, position, color } = req.body;
    const nextPos = position ?? (await query("SELECT COALESCE(MAX(position), -1) + 1 as next FROM lead_stages")).rows[0].next;
    const result = await query(
      "INSERT INTO lead_stages (name, position, color) VALUES ($1, $2, $3) RETURNING *",
      [name, nextPos, color || "#6b7280"]
    );
    res.status(201).json({ stage: result.rows[0] });
  } catch (err) {
    console.error("Create stage error:", err);
    res.status(500).json({ error: "Failed to create stage" });
  }
});

router.put("/stages/:id", authenticate, requireAdmin, validate(z.object({
  name: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  color: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const { name, position, color } = req.body;
    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (position !== undefined) { fields.push(`position = $${idx++}`); values.push(position); }
    if (color) { fields.push(`color = $${idx++}`); values.push(color); }
    if (fields.length === 0) return res.status(400).json({ error: "No fields" });
    values.push(req.params.id);
    const result = await query(
      `UPDATE lead_stages SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Stage not found" });
    res.json({ stage: result.rows[0] });
  } catch (err) {
    console.error("Update stage error:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
});

// ─── Leads ─────────────────────────────────────────────────────────

router.get("/leads", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stage, search, assigned, page = "1", limit = "20" } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const params: any[] = [];
    const conditions: string[] = [];

    if (req.userRole !== "admin") {
      conditions.push(`(l.assigned_to = $${params.length + 1} OR l.user_id = $${params.length + 1})`);
      params.push(req.userId);
    }
    if (stage) {
      conditions.push(`s.slug = $${params.length + 1}`);
      params.push(stage);
    }
    if (assigned) {
      conditions.push(`l.assigned_to = $${params.length + 1}`);
      params.push(assigned);
    }
    if (search) {
      conditions.push(
        `(l.contact_name ILIKE $${params.length + 1} OR l.company ILIKE $${params.length + 1} OR l.contact_email ILIKE $${params.length + 1})`
      );
      params.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await query(
      `SELECT COUNT(*) FROM leads l LEFT JOIN lead_stages s ON l.stage_id = s.id ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT l.*, s.name as stage_name, s.color as stage_color, s.position as stage_position,
              u.first_name || ' ' || u.last_name as assigned_name
       FROM leads l
       LEFT JOIN lead_stages s ON l.stage_id = s.id
       LEFT JOIN users u ON l.assigned_to = u.id
       ${where}
       ORDER BY l.updated_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit as string), offset]
    );

    res.json({
      leads: result.rows,
      pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total, pages: Math.ceil(total / parseInt(limit as string)) },
    });
  } catch (err) {
    console.error("Get leads error:", err);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

router.post("/leads", authenticate, validate(z.object({
  userId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  company: z.string().optional(),
  contactName: z.string().min(1),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
  value: z.number().positive().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, stageId, company, contactName, contactEmail, contactPhone, source, value, notes, assignedTo } = req.body;

    const defaultStage = stageId || (await query("SELECT id FROM lead_stages ORDER BY position LIMIT 1")).rows[0]?.id;
    if (!defaultStage) return res.status(400).json({ error: "No lead stages configured" });

    const result = await query(
      `INSERT INTO leads (user_id, stage_id, company, contact_name, contact_email, contact_phone, source, value, notes, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId || null, defaultStage, company || null, contactName, contactEmail || null, contactPhone || null, source || null, value || null, notes || null, assignedTo || null]
    );

    await query(
      `INSERT INTO activities (lead_id, user_id, type, description)
       VALUES ($1, $2, 'created', $3)`,
      [result.rows[0].id, req.userId, `Lead created by ${req.userRole}`]
    );

    const leadCreated = await query(
      `SELECT l.*, s.name as stage_name, s.color as stage_color
       FROM leads l LEFT JOIN lead_stages s ON l.stage_id = s.id WHERE l.id = $1`,
      [result.rows[0].id]
    );

    const newLead = leadCreated.rows[0];
    if (newLead.contact_email) {
      notifyAndLog({
        recipientEmail: newLead.contact_email,
        recipientName: newLead.contact_name || undefined,
        subject: "Lead Created",
        body: `Lead for ${newLead.contact_name || newLead.contact_email} has been created.`,
        eventType: "lead.created",
        entityType: "lead",
        entityId: newLead.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.status(201).json({ lead: newLead });
  } catch (err) {
    console.error("Create lead error:", err);
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// Update lead
router.put("/leads/:id", authenticate, validate(z.object({
  stageId: z.string().uuid().optional(),
  company: z.string().optional(),
  contactName: z.string().min(1).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
  value: z.number().positive().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    if (!isAdmin) {
      const accessCheck = await query(
        `SELECT id FROM leads WHERE id = $1 AND (assigned_to = $2 OR user_id = $2)`,
        [req.params.id, req.userId]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
    }
    const allowed = ["stageId", "company", "contactName", "contactEmail", "contactPhone", "source", "value", "notes", "assignedTo"];
    const fieldMap: Record<string, string> = {
      stageId: "stage_id", company: "company", contactName: "contact_name",
      contactEmail: "contact_email", contactPhone: "contact_phone", source: "source",
      value: "value", notes: "notes", assignedTo: "assigned_to",
    };
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${fieldMap[key]} = $${idx++}`);
        values.push(req.body[key] === "" ? null : req.body[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: "No fields" });

    fields.push("updated_at = NOW()");
    values.push(req.params.id);

    const result = await query(
      `UPDATE leads SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Lead not found" });

    await query(
      `INSERT INTO activities (lead_id, user_id, type, description) VALUES ($1, $2, 'updated', 'Lead updated')`,
      [req.params.id, req.userId]
    );

    const leadUpd = await query(
      `SELECT l.*, s.name as stage_name, s.color as stage_color
       FROM leads l LEFT JOIN lead_stages s ON l.stage_id = s.id WHERE l.id = $1`,
      [result.rows[0].id]
    );

    const updLead = leadUpd.rows[0];
    if (updLead.contact_email) {
      notifyAndLog({
        recipientEmail: updLead.contact_email,
        recipientName: updLead.contact_name || undefined,
        subject: "Lead Updated",
        body: `Lead for ${updLead.contact_name || updLead.contact_email} has been updated.`,
        eventType: "lead.updated",
        entityType: "lead",
        entityId: updLead.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.json({ lead: updLead });
  } catch (err) {
    console.error("Update lead error:", err);
    res.status(500).json({ error: "Failed to update lead" });
  }
});

router.patch("/leads/:id/stage", authenticate, validate(z.object({
  stageId: z.string().uuid(),
  notes: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    if (!isAdmin) {
      const accessCheck = await query(
        `SELECT id FROM leads WHERE id = $1 AND (assigned_to = $2 OR user_id = $2)`,
        [req.params.id, req.userId]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
    }
    const old = await query("SELECT stage_id FROM leads WHERE id = $1", [req.params.id]);
    if (old.rows.length === 0) return res.status(404).json({ error: "Lead not found" });

    const result = await query(
      "UPDATE leads SET stage_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [req.body.stageId, req.params.id]
    );

    const newStage = await query("SELECT name FROM lead_stages WHERE id = $1", [req.body.stageId]);
    const oldStage = await query("SELECT name FROM lead_stages WHERE id = $1", [old.rows[0].stage_id]);

    await query(
      `INSERT INTO activities (lead_id, user_id, type, description, metadata)
       VALUES ($1, $2, 'stage_change', $3, $4)`,
      [req.params.id, req.userId,
       `Moved from "${oldStage.rows[0]?.name || "?"}" to "${newStage.rows[0]?.name || "?"}"`,
       JSON.stringify({ from: old.rows[0].stage_id, to: req.body.stageId, notes: req.body.notes || null })]
    );

    const stageLead = await query(
      `SELECT l.*, s.name as stage_name, s.color as stage_color
       FROM leads l LEFT JOIN lead_stages s ON l.stage_id = s.id WHERE l.id = $1`,
      [result.rows[0].id]
    );

    const changedLead = stageLead.rows[0];
    if (changedLead.contact_email) {
      notifyAndLog({
        recipientEmail: changedLead.contact_email,
        recipientName: changedLead.contact_name || undefined,
        subject: "Lead Stage Changed",
        body: `Lead stage changed from "${oldStage.rows[0]?.name || "?"}" to "${newStage.rows[0]?.name || "?"}".`,
        eventType: "lead.stage_changed",
        entityType: "lead",
        entityId: changedLead.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.json({ lead: changedLead });
  } catch (err) {
    console.error("Update lead stage error:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
});

// ─── Activity Timeline (for leads) ─────────────────────────────────

router.get("/leads/:id/timeline", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    if (!isAdmin) {
      const accessCheck = await query(
        `SELECT id FROM leads WHERE id = $1 AND (assigned_to = $2 OR user_id = $2)`,
        [req.params.id, req.userId]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
    }
    const result = await query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as user_name
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.lead_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json({ activities: result.rows });
  } catch (err) {
    console.error("Get timeline error:", err);
    res.status(500).json({ error: "Failed to fetch timeline" });
  }
});

router.post("/leads/:id/activities", authenticate, validate(z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  metadata: z.record(z.any()).optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    if (!isAdmin) {
      const accessCheck = await query(
        `SELECT id FROM leads WHERE id = $1 AND (assigned_to = $2 OR user_id = $2)`,
        [req.params.id, req.userId]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }
    }
    const result = await query(
      `INSERT INTO activities (lead_id, user_id, type, description, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, req.userId, req.body.type, req.body.description, req.body.metadata || {}]
    );
    res.status(201).json({ activity: result.rows[0] });
  } catch (err) {
    console.error("Create activity error:", err);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// ─── Customer Unified Timeline ─────────────────────────────────────

router.get("/customers/:id/timeline", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [orders, rfqs, bookings] = await Promise.all([
      query("SELECT 'order' as type, id, order_number as title, total as amount, status, created_at FROM orders WHERE user_id = $1", [req.params.id]),
      query(`SELECT 'rfq' as type, r.id, p.name as title, r.quantity as amount, r.status, r.created_at
             FROM rfqs r LEFT JOIN products p ON r.product_id = p.id WHERE r.user_id = $1`, [req.params.id]),
      query("SELECT 'booking' as type, id, preferred_date::text as title, status, created_at FROM service_bookings WHERE user_id = $1", [req.params.id]),
    ]);

    const timeline = [
      ...orders.rows.map((r: any) => ({ ...r, icon: "shopping-cart" })),
      ...rfqs.rows.map((r: any) => ({ ...r, icon: "file-text" })),
      ...bookings.rows.map((r: any) => ({ ...r, icon: "calendar" })),
    ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ timeline });
  } catch (err) {
    console.error("Get customer timeline error:", err);
    res.status(500).json({ error: "Failed to fetch customer timeline" });
  }
});

// ─── Tasks (Follow-up Reminders) ───────────────────────────────────

router.get("/tasks", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { completed, overdue, assignee } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    if (req.userRole !== "admin") {
      conditions.push(`t.assigned_to = $${params.length + 1}`);
      params.push(req.userId);
    }
    if (completed === "true") conditions.push("t.is_completed = true");
    else if (completed === "false") conditions.push("t.is_completed = false");
    if (overdue === "true") conditions.push("t.due_date < NOW() AND t.is_completed = false");
    if (assignee) { conditions.push(`t.assigned_to = $${params.length + 1}`); params.push(assignee); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(
      `SELECT t.*, u.first_name || ' ' || u.last_name as assigned_name,
              l.contact_name as lead_name, l.company as lead_company
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN leads l ON t.lead_id = l.id
       ${where}
       ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
      params
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error("Get tasks error:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.post("/tasks", authenticate, validate(z.object({
  leadId: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { leadId, assignedTo, title, description, dueDate } = req.body;
    const result = await query(
      `INSERT INTO tasks (lead_id, assigned_to, title, description, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [leadId || null, assignedTo || req.userId, title, description || null, dueDate || null]
    );

    if (leadId) {
      await query(
        `INSERT INTO activities (lead_id, user_id, type, description)
         VALUES ($1, $2, 'task_created', $3)`,
        [leadId, req.userId, `Task created: ${title}`]
      );
    }

    const createdTask = result.rows[0];
    const taskAssignedUser = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [createdTask.assigned_to]);
    if (taskAssignedUser.rows.length > 0) {
      const tu = taskAssignedUser.rows[0];
      notifyAndLog({
        recipientEmail: tu.email,
        recipientName: `${tu.first_name} ${tu.last_name}`,
        subject: "Task Created",
        body: `Task "${createdTask.title}" has been created.`,
        eventType: "task.created",
        entityType: "task",
        entityId: createdTask.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.status(201).json({ task: createdTask });
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

router.patch("/tasks/:id", authenticate, validate(z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  isCompleted: z.boolean().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    if (!isAdmin) {
      const accessCheck = await query(
        `SELECT id FROM tasks WHERE id = $1 AND assigned_to = $2`,
        [req.params.id, req.userId]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: "Task not found" });
      }
    }
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const { title, description, dueDate, isCompleted, assignedTo } = req.body;

    if (title) { fields.push(`title = $${idx++}`); values.push(title); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (dueDate !== undefined) { fields.push(`due_date = $${idx++}`); values.push(dueDate); }
    if (isCompleted !== undefined) { fields.push(`is_completed = $${idx++}`); values.push(isCompleted); }
    if (assignedTo !== undefined) { fields.push(`assigned_to = $${idx++}`); values.push(assignedTo); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields" });
    fields.push("updated_at = NOW()");
    values.push(req.params.id);

    const result = await query(
      `UPDATE tasks SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Task not found" });
    const updatedTask = result.rows[0];
    const taskAssigned = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [updatedTask.assigned_to]);
    if (taskAssigned.rows.length > 0) {
      const tu = taskAssigned.rows[0];
      notifyAndLog({
        recipientEmail: tu.email,
        recipientName: `${tu.first_name} ${tu.last_name}`,
        subject: "Task Updated",
        body: `Task "${updatedTask.title}" has been updated.`,
        eventType: "task.updated",
        entityType: "task",
        entityId: updatedTask.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }
    res.json({ task: updatedTask });
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ─── Pipeline Stats ────────────────────────────────────────────────

router.get("/pipeline", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT s.id, s.name, s.color, s.position, COUNT(l.id) as lead_count,
              COALESCE(SUM(l.value), 0) as total_value
       FROM lead_stages s
       LEFT JOIN leads l ON l.stage_id = s.id
       GROUP BY s.id, s.name, s.color, s.position
       ORDER BY s.position`
    );
    res.json({ pipeline: result.rows });
  } catch (err) {
    console.error("Get pipeline error:", err);
    res.status(500).json({ error: "Failed to fetch pipeline" });
  }
});

export default router;
