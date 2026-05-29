import { query, transaction } from "../config/db";

interface QuestionConfig {
  id: string;
  question_key: string;
  label: string;
  helper_text: string | null;
  input_type: string;
  options: any;
  required: boolean;
  score_weight: number;
  display_order: number;
  conditional_logic: any;
  active: boolean;
}

interface AnswerInput {
  question_key: string;
  raw_value: string;
  display_label?: string;
}

interface ScoreResult {
  score: number;
  band: string;
  contributions: { question_key: string; contribution: number; max_possible: number }[];
}

function getMaxScore(questions: QuestionConfig[]): number {
  return questions.reduce((sum, q) => sum + q.score_weight, 0) || 1;
}

function scoreQuestion(question: QuestionConfig, rawValue: string | null): number {
  if (!rawValue || rawValue === "" || rawValue === "no") return 0;

  const weight = question.score_weight;
  if (weight === 0) return 0;

  switch (question.question_key) {
    case "business_age": {
      const scores: Record<string, number> = {
        less_than_6mo: 0.1,
        "6mo_1yr": 0.3,
        "1_3yr": 0.5,
        "3_5yr": 0.75,
        more_than_5yr: 1.0,
      };
      return Math.round((scores[rawValue] || 0) * weight);
    }
    case "monthly_purchase_volume": {
      const scores: Record<string, number> = {
        under_1000: 0.1,
        "1000_5000": 0.3,
        "5000_20000": 0.6,
        "20000_50000": 0.8,
        above_50000: 1.0,
      };
      return Math.round((scores[rawValue] || 0) * weight);
    }
    case "expected_order_frequency": {
      const scores: Record<string, number> = {
        weekly: 1.0,
        biweekly: 0.8,
        monthly: 0.6,
        occasionally: 0.3,
        onetime: 0.1,
      };
      return Math.round((scores[rawValue] || 0) * weight);
    }
    case "is_registered_business": {
      return rawValue === "yes" ? weight : 0;
    }
    case "has_trade_reference": {
      return rawValue === "yes" ? weight : 0;
    }
    case "registration_document": {
      return rawValue ? weight : 0;
    }
    case "main_delivery_location": {
      return rawValue && rawValue.length >= 3 ? weight : 0;
    }
    case "business_stage": {
      const scores: Record<string, number> = {
        established: 1.0,
        growing: 0.7,
        new_building: 0.3,
        project_based: 0.3,
        other: 0.1,
      };
      return Math.round((scores[rawValue] || 0) * weight);
    }
    case "requested_credit_limit": {
      const num = parseFloat(rawValue);
      if (isNaN(num) || num <= 0) return 0;
      if (num <= 1000) return Math.round(weight * 0.1);
      if (num <= 5000) return Math.round(weight * 0.3);
      if (num <= 20000) return Math.round(weight * 0.6);
      if (num <= 50000) return Math.round(weight * 0.8);
      return Math.round(weight * 1.0);
    }
    case "preferred_repayment_period": {
      const scores: Record<string, number> = {
        "7_days": 1.0,
        "14_days": 0.8,
        "30_days": 0.5,
        "45_days": 0.3,
      };
      return Math.round((scores[rawValue] || 0) * weight);
    }
    default:
      return rawValue ? weight : 0;
  }
}

function computeBand(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  if (pct >= 80) return "strong";
  if (pct >= 50) return "review";
  return "needs_info";
}

export async function getActiveQuestions(): Promise<QuestionConfig[]> {
  const result = await query(
    "SELECT * FROM vetting_questions WHERE active = true ORDER BY display_order ASC"
  );
  return result.rows.map((r: any) => ({
    ...r,
    options: typeof r.options === "string" ? JSON.parse(r.options) : r.options,
    conditional_logic: typeof r.conditional_logic === "string" ? JSON.parse(r.conditional_logic) : r.conditional_logic,
  }));
}

export async function getSubmission(companyId: string): Promise<any | null> {
  const result = await query(
    "SELECT * FROM vetting_submissions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
    [companyId]
  );
  return result.rows[0] || null;
}

export async function getResponses(submissionId: string): Promise<any[]> {
  const result = await query(
    "SELECT * FROM vetting_responses WHERE submission_id = $1 ORDER BY created_at ASC",
    [submissionId]
  );
  return result.rows;
}

export async function getAuditLog(companyId: string): Promise<any[]> {
  const result = await query(
    `SELECT v.*, u.first_name || ' ' || u.last_name as admin_name
     FROM vetting_audit_log v
     LEFT JOIN users u ON v.admin_id = u.id
     WHERE v.company_id = $1
     ORDER BY v.created_at DESC`,
    [companyId]
  );
  return result.rows;
}

export async function saveDraft(
  companyId: string,
  userId: string,
  answers: AnswerInput[]
): Promise<any> {
  return transaction(async (client) => {
    // Get or create draft submission
    let subResult = await client.query(
      "SELECT id FROM vetting_submissions WHERE company_id = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
      [companyId]
    );

    let submissionId: string;
    if (subResult.rows.length === 0) {
      const newSub = await client.query(
        "INSERT INTO vetting_submissions (company_id, user_id, status) VALUES ($1, $2, 'draft') RETURNING id",
        [companyId, userId]
      );
      submissionId = newSub.rows[0].id;
    } else {
      submissionId = subResult.rows[0].id;
      // Clear old draft responses
      await client.query("DELETE FROM vetting_responses WHERE submission_id = $1", [submissionId]);
    }

    // Get questions for snapshot
    const questionsResult = await client.query(
      "SELECT * FROM vetting_questions WHERE active = true"
    );
    const questions: QuestionConfig[] = questionsResult.rows.map((r: any) => ({
      ...r,
      options: typeof r.options === "string" ? JSON.parse(r.options) : r.options,
      conditional_logic: typeof r.conditional_logic === "string" ? JSON.parse(r.conditional_logic) : r.conditional_logic,
    }));

    // Store responses
    for (const answer of answers) {
      const q = questions.find((q) => q.question_key === answer.question_key);
      if (!q) continue;

      const scoreContribution = scoreQuestion(q, answer.raw_value);

      await client.query(
        `INSERT INTO vetting_responses (submission_id, question_key, question_label, question_input_type, question_options, question_score_weight, raw_value, display_label, score_contribution)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [
          submissionId,
          q.question_key,
          q.label,
          q.input_type,
          JSON.stringify(q.options || []),
          q.score_weight,
          answer.raw_value || null,
          answer.display_label || null,
          scoreContribution,
        ]
      );
    }

    return { submissionId };
  });
}

export async function submitVetting(
  companyId: string,
  userId: string,
  answers: AnswerInput[]
): Promise<{ submission: any; score: number; band: string }> {
  return transaction(async (client) => {
    // Save all answers
    const questions = await getActiveQuestions();
    const maxScore = getMaxScore(questions);

    // Get or create submission
    let subResult = await client.query(
      "SELECT id FROM vetting_submissions WHERE company_id = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
      [companyId]
    );

    let submissionId: string;
    if (subResult.rows.length === 0) {
      const newSub = await client.query(
        "INSERT INTO vetting_submissions (company_id, user_id, status) VALUES ($1, $2, 'draft') RETURNING id",
        [companyId, userId]
      );
      submissionId = newSub.rows[0].id;
    } else {
      submissionId = subResult.rows[0].id;
      await client.query("DELETE FROM vetting_responses WHERE submission_id = $1", [submissionId]);
    }

    let totalScore = 0;
    const contributions: { question_key: string; contribution: number; max_possible: number }[] = [];

    for (const answer of answers) {
      const q = questions.find((q) => q.question_key === answer.question_key);
      if (!q) continue;

      const scoreContribution = scoreQuestion(q, answer.raw_value);
      totalScore += scoreContribution;

      contributions.push({
        question_key: q.question_key,
        contribution: scoreContribution,
        max_possible: q.score_weight,
      });

      await client.query(
        `INSERT INTO vetting_responses (submission_id, question_key, question_label, question_input_type, question_options, question_score_weight, raw_value, display_label, score_contribution)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [
          submissionId,
          q.question_key,
          q.label,
          q.input_type,
          JSON.stringify(q.options || []),
          q.score_weight,
          answer.raw_value || null,
          answer.display_label || null,
          scoreContribution,
        ]
      );
    }

    const band = computeBand(totalScore, maxScore);

    await client.query(
      `UPDATE vetting_submissions SET status = 'submitted', score = $1, score_band = $2, submitted_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [totalScore, band, submissionId]
    );

    // Audit log
    await client.query(
      `INSERT INTO vetting_audit_log (submission_id, company_id, action, previous_status, new_status, score_at_action)
       VALUES ($1, $2, 'submitted', 'draft', 'submitted', $3)`,
      [submissionId, companyId, totalScore]
    );

    const subResult2 = await client.query("SELECT * FROM vetting_submissions WHERE id = $1", [submissionId]);

    return { submission: subResult2.rows[0], score: totalScore, band };
  });
}

export async function getFullVettingProfile(companyId: string): Promise<any | null> {
  const submission = await getSubmission(companyId);
  if (!submission) return null;

  const responses = await getResponses(submission.id);
  const auditLog = await getAuditLog(companyId);

  // Build key-value map of responses
  const answersMap: Record<string, string> = {};
  const answerLabels: Record<string, string> = {};
  for (const r of responses) {
    answersMap[r.question_key] = r.raw_value;
    answerLabels[r.question_key] = r.display_label;
  }

  return {
    submission,
    responses,
    auditLog,
    answersMap,
    answerLabels,
    businessAge: answersMap["business_age"],
    businessType: answersMap["business_type"],
    monthlyPurchaseVolume: answersMap["monthly_purchase_volume"],
    expectedOrderFrequency: answersMap["expected_order_frequency"],
    wantsCreditSales: answersMap["wants_credit_sales"],
    requestedCreditLimit: answersMap["requested_credit_limit"],
    preferredRepaymentPeriod: answersMap["preferred_repayment_period"],
    isRegisteredBusiness: answersMap["is_registered_business"],
    registrationNumber: answersMap["registration_number"],
    registrationDocument: answersMap["registration_document"],
    hasTradeReference: answersMap["has_trade_reference"],
    referenceCompanyName: answersMap["reference_company_name"],
    referenceContactPerson: answersMap["reference_contact_person"],
    referencePhone: answersMap["reference_phone"],
    mainDeliveryLocation: answersMap["main_delivery_location"],
    businessStage: answersMap["business_stage"],
  };
}

export async function adminUpdateVettingStatus(
  submissionId: string,
  companyId: string,
  adminId: string,
  newStatus: string,
  note?: string
): Promise<any> {
  return transaction(async (client) => {
    const sub = await client.query(
      "SELECT status, score FROM vetting_submissions WHERE id = $1 FOR UPDATE",
      [submissionId]
    );
    if (sub.rows.length === 0) throw new Error("Submission not found");

    const previousStatus = sub.rows[0].status;
    const score = sub.rows[0].score;

    await client.query(
      `UPDATE vetting_submissions SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3, updated_at = NOW() WHERE id = $4`,
      [newStatus, adminId, note || null, submissionId]
    );

    await client.query(
      `INSERT INTO vetting_audit_log (submission_id, company_id, admin_id, action, previous_status, new_status, note, score_at_action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        submissionId,
        companyId,
        adminId,
        newStatus === "approved" ? "approved" : newStatus === "rejected" ? "rejected" : newStatus === "needs_info" ? "needs_info" : "status_changed",
        previousStatus,
        newStatus,
        note || null,
        score,
      ]
    );

    const updated = await client.query("SELECT * FROM vetting_submissions WHERE id = $1", [submissionId]);
    return updated.rows[0];
  });
}

export async function addVettingNote(
  submissionId: string,
  companyId: string,
  adminId: string,
  note: string
): Promise<void> {
  await query(
    `INSERT INTO vetting_audit_log (submission_id, company_id, admin_id, action, note)
     VALUES ($1, $2, $3, 'note_added', $4)`,
    [submissionId, companyId, adminId, note]
  );
}

// Scoring for admin display
export function getScoreBandInfo(score: number, maxScore: number): { label: string; color: string; description: string } {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  if (pct >= 80) return { label: "Strong Profile", color: "green", description: "Recommended for approval" };
  if (pct >= 50) return { label: "Manual Review", color: "amber", description: "Requires manual review" };
  return { label: "Needs Information", color: "red", description: "More information needed" };
}
