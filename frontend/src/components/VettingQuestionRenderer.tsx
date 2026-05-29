"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Check, X, Upload, FilePdf, FileImage, Spinner, Trash } from "@phosphor-icons/react";
import toast from "react-hot-toast";

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

interface VettingQuestionRendererProps {
  questions: Question[];
  answers: Answer[];
  onChange: (questionKey: string, rawValue: string | null, displayLabel: string | null) => void;
  errors: Record<string, string>;
  documents?: UploadedDoc[];
  onDocumentUploaded?: (doc: UploadedDoc) => void;
  onDocumentRemoved?: (docId: string) => void;
}

function isVisible(question: Question, answers: Answer[]): boolean {
  if (!question.conditional_logic) return true;
  const { depends_on, value } = question.conditional_logic;
  const parentAnswer = answers.find((a) => a.question_key === depends_on);
  return parentAnswer?.raw_value === value;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") return <FilePdf size={20} className="text-red-500" />;
  return <FileImage size={20} className="text-blue-500" />;
}

export default function VettingQuestionRenderer({
  questions,
  answers,
  onChange,
  errors,
  documents = [],
  onDocumentUploaded,
  onDocumentRemoved,
}: VettingQuestionRendererProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const visibleQuestions = questions.filter((q) => isVisible(q, answers));

  const getValue = (key: string) => answers.find((a) => a.question_key === key)?.raw_value || "";
  const setValue = (key: string, rawValue: string, displayLabel?: string) => {
    onChange(key, rawValue || null, displayLabel || null);
  };

  const getDocs = (questionKey: string) => documents.filter((d) => d.question_key === questionKey);

  const handleFileUpload = async (questionKey: string, file: File) => {
    setUploading(questionKey);
    try {
      const res = await api.uploadVettingDocument(file, questionKey);
      setValue(questionKey, res.document.id, file.name);
      onDocumentUploaded?.(res.document);
      toast.success(`${file.name} uploaded`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(questionKey);
    }
  };

  const handleFileChange = async (questionKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileUpload(questionKey, file);
    e.target.value = "";
  };

  const handleDrop = async (questionKey: string, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await handleFileUpload(questionKey, file);
  };

  const handleRemove = (docId: string) => {
    onDocumentRemoved?.(docId);
  };

  return (
    <div className="space-y-6">
      {visibleQuestions.map((q) => (
        <div key={q.id} className="space-y-2">
          <label className="block">
            <span className="text-sm font-medium text-ink">
              {q.label}
              {q.required && <span className="text-red-500 ml-0.5">*</span>}
            </span>
            {q.helper_text && (
              <span className="block text-xs text-muted mt-0.5">{q.helper_text}</span>
            )}
          </label>

          {/* Select */}
          {q.input_type === "select" && q.options && (
            <select
              value={getValue(q.question_key)}
              onChange={(e) => {
                const opt = q.options!.find((o) => o.value === e.target.value);
                setValue(q.question_key, e.target.value, opt?.label || e.target.value);
              }}
              className={`input w-full ${errors[q.question_key] ? "border-red-400" : ""}`}
            >
              <option value="">Select...</option>
              {q.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {/* Yes/No */}
          {q.input_type === "yes_no" && (
            <div className="flex gap-2">
              {["yes", "no"].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setValue(q.question_key, val, val === "yes" ? "Yes" : "No")}
                  className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                    getValue(q.question_key) === val
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-ink border-border hover:border-accent/50"
                  }`}
                >
                  {val === "yes" ? (
                    <span className="flex items-center justify-center gap-1.5"><Check size={16} weight="bold" /> Yes</span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5"><X size={16} weight="bold" /> No</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Text */}
          {(q.input_type === "text" || q.input_type === "number") && (
            <input
              type={q.input_type === "number" ? "number" : "text"}
              value={getValue(q.question_key)}
              onChange={(e) => setValue(q.question_key, e.target.value, e.target.value)}
              className={`input w-full ${errors[q.question_key] ? "border-red-400" : ""}`}
              placeholder={q.helper_text || ""}
            />
          )}

          {/* Currency */}
          {q.input_type === "currency" && (
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink">GH₵</span>
              <input
                type="number"
                min={0}
                value={getValue(q.question_key)}
                onChange={(e) => {
                  const val = e.target.value;
                  const num = parseInt(val) || 0;
                  setValue(q.question_key, val, `GHS ${num.toLocaleString()}`);
                }}
                className={`input w-full pl-14 ${errors[q.question_key] ? "border-red-400" : ""}`}
                placeholder="0"
              />
            </div>
          )}

          {/* Slider */}
          {q.input_type === "slider" && q.options && (() => {
            const opts = q.options!;
            return (
              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={opts.length - 1}
                  value={Math.max(0, opts.findIndex((o) => o.value === getValue(q.question_key)))}
                  onChange={(e) => {
                    const idx = parseInt(e.target.value);
                    const opt = opts[idx];
                    setValue(q.question_key, opt.value, opt.label);
                  }}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs text-muted">
                  {opts.map((opt, i) => (
                    <span key={opt.value} className={`text-center ${getValue(q.question_key) === opt.value ? "text-accent font-semibold" : ""}`}
                      style={{ width: `${100 / opts.length}%` }}>
                      {i === 0 || i === opts.length - 1 || getValue(q.question_key) === opt.value ? opt.label : ""}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Upload */}
          {q.input_type === "upload" && (
            <div>
              <input
                ref={(el) => { fileInputRefs.current[q.question_key] = el; }}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleFileChange(q.question_key, e)}
                className="hidden"
              />

              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(q.question_key, e)}
                onClick={() => fileInputRefs.current[q.question_key]?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                  ${uploading === q.question_key ? "border-accent/50 bg-accent/5" : "border-border hover:border-accent/50 hover:bg-zinc-50"}`}
              >
                {uploading === q.question_key ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-muted">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={24} className="text-muted" />
                    <span className="text-sm font-medium text-ink">Click to upload or drag and drop</span>
                    <span className="text-xs text-muted">PDF, JPG, or PNG (max 10 MB)</span>
                  </div>
                )}
              </div>

              {/* Uploaded files */}
              {getDocs(q.question_key).length > 0 && (
                <div className="mt-3 space-y-2">
                  {getDocs(q.question_key).map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 rounded-lg border border-border">
                      <FileIcon mimeType={doc.mime_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{doc.original_filename}</p>
                        <p className="text-xs text-muted">{formatSize(doc.size_bytes)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemove(doc.id); }}
                        className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Hidden answer: store the first doc ID */}
              {getDocs(q.question_key).length > 0 && getValue(q.question_key) !== getDocs(q.question_key)[0].id && (
                (() => { setValue(q.question_key, getDocs(q.question_key)[0].id, getDocs(q.question_key)[0].original_filename); return null; })()
              )}
            </div>
          )}

          {errors[q.question_key] && (
            <p className="text-xs text-red-500 mt-1">{errors[q.question_key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
