"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import VettingQuestionRenderer from "./VettingQuestionRenderer";
import toast from "react-hot-toast";
import { ArrowRight, Check } from "@phosphor-icons/react";

interface Question {
  id: string;
  question_key: string;
  label: string;
  helper_text: string | null;
  input_type: string;
  options: { value: string; label: string }[] | null;
  required: boolean;
  score_weight: number;
  display_order: number;
  conditional_logic: { depends_on: string; value: string } | null;
  active: boolean;
}

interface Answer {
  question_key: string;
  raw_value: string | null;
  display_label: string | null;
}

interface UploadedDoc {
  id: string;
  question_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
}

interface VettingFormModalProps {
  onComplete?: () => void;
  onClose?: () => void;
}

const TOTAL_STEPS = 3;

export default function VettingFormModal({ onComplete, onClose }: VettingFormModalProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);

  const [answers, setAnswers] = useState<Answer[]>([]);

  useEffect(() => {
    api.getVettingQuestions().then((res) => {
      setQuestions(res.questions);
    }).catch(() => {
      toast.error("Failed to load questions");
    }).finally(() => setLoading(false));
  }, []);

  const getValue = useCallback((key: string) => {
    return answers.find((a) => a.question_key === key)?.raw_value || "";
  }, [answers]);

  const handleChange = useCallback((questionKey: string, rawValue: string | null, displayLabel: string | null) => {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.question_key === questionKey);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { question_key: questionKey, raw_value: rawValue, display_label: displayLabel };

        const dependentKeys = questions
          .filter((q) => q.conditional_logic?.depends_on === questionKey)
          .map((q) => q.question_key);
        for (const dk of dependentKeys) {
          const depIdx = next.findIndex((a) => a.question_key === dk);
          if (depIdx >= 0) {
            next[depIdx] = { question_key: dk, raw_value: null, display_label: null };
          }
        }

        return next;
      }
      return [...prev, { question_key: questionKey, raw_value: rawValue, display_label: displayLabel }];
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
  }, [questions]);

  const handleDocumentUploaded = useCallback((doc: UploadedDoc) => {
    setDocuments((prev) => [...prev.filter((d) => d.id !== doc.id), doc]);
  }, []);

  const handleDocumentRemoved = useCallback((docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  const stepQuestions = (): Question[] => {
    const visible = questions.filter((q) => {
      if (!q.conditional_logic) return true;
      const { depends_on, value } = q.conditional_logic;
      const parentAnswer = answers.find((a) => a.question_key === depends_on);
      return parentAnswer?.raw_value === value;
    });

    if (step === 1) return visible.filter((q) => ["business_age", "business_type", "monthly_purchase_volume", "expected_order_frequency", "business_stage"].includes(q.question_key));
    if (step === 2) return visible.filter((q) => ["is_registered_business", "registration_number", "registration_document", "has_trade_reference", "reference_company_name", "reference_contact_person", "reference_phone"].includes(q.question_key));
    if (step === 3) return visible.filter((q) => ["wants_credit_sales", "requested_credit_limit", "preferred_repayment_period", "main_delivery_location"].includes(q.question_key));
    return [];
  };

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    const sq = stepQuestions();
    for (const q of sq) {
      if (q.required) {
        const val = getValue(q.question_key);
        if (!val || val === "") {
          newErrors[q.question_key] = "This field is required";
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const handlePrev = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const formatted = answers.filter((a) => a.raw_value !== null && a.raw_value !== "");
      await api.submitVetting({ answers: formatted });
      toast.success("Vetting profile submitted!");
      onComplete?.();
      router.push("/account");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted">Step {step} of {TOTAL_STEPS}</span>
          <span className="text-xs text-muted">{Math.round((step / TOTAL_STEPS) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {step === 1 && (
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Tell us about your business</h2>
          <p className="mt-1 text-sm text-muted mb-6">This helps Bali-Can understand your needs and offer the right purchasing terms.</p>
          <VettingQuestionRenderer questions={stepQuestions()} answers={answers} onChange={handleChange} errors={errors} />
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Business verification</h2>
          <p className="mt-1 text-sm text-muted mb-6">Help us verify your business details so we can process your account faster.</p>
          <VettingQuestionRenderer
            questions={stepQuestions()}
            answers={answers}
            onChange={handleChange}
            errors={errors}
            documents={documents}
            onDocumentUploaded={handleDocumentUploaded}
            onDocumentRemoved={handleDocumentRemoved}
          />
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Credit & delivery preferences</h2>
          <p className="mt-1 text-sm text-muted mb-6">Let us know your preferred payment terms and where you need deliveries.</p>
          <VettingQuestionRenderer questions={stepQuestions()} answers={answers} onChange={handleChange} errors={errors} />
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={step === 1 ? onClose || (() => router.push("/account")) : handlePrev}
          className="btn gap-2"
        >
          {step === 1 ? "Skip for now" : "Back"}
        </button>

        {step < TOTAL_STEPS ? (
          <button type="button" onClick={handleNext} className="btn btn-primary gap-2">
            Continue
            <ArrowRight size={16} weight="bold" />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={submitting} className="btn btn-primary gap-2">
            {submitting ? (
              <>Submitting...</>
            ) : (
              <>
                <Check size={16} weight="bold" />
                Submit Profile
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
