// Stage 8: independent evaluation (labels from two AI models, LLM-as-judge, not humans).
// Run with: bun test
import { describe, expect, test } from "bun:test";
import { aiEvalRows, caseTypeLabel, fmtKappa, isAiEvaluation } from "./adapter";
import type { ApiAiEvalScores, ApiAiEvaluation } from "./api";

const scores = (x: number): ApiAiEvalScores => ({
  n: 10,
  action_accuracy: x,
  decision_accuracy: x,
  automation_rate: x,
  false_auto_execution_rate: x,
  unnecessary_escalation_rate: x,
});

const sample = {
  about: "test",
  labels_source: "LLM-as-judge (two AI models), not humans",
  labellers: { claude: "c", gemini: "g" },
  limitations: ["AI labels"],
  system: { reasoning_backend: "rule", retriever: "tfidf", corpus: "v1" },
  counts: {
    scenarios: 80,
    agreed: 10,
    ambiguous: 70,
    action_agreed: 12,
    case_types: {},
    agreed_by_case_type: {},
  },
  agreement: {
    overall: {
      correct_action: { n: 80, raw_agreement: 0.5, kappa: 0.3 },
      needs_human_review: { n: 80, raw_agreement: 0.6, kappa: null },
    },
    by_category: {},
  },
  action_accuracy_action_agreed: { n: 12, value: 0.5 },
  results: { gate: scores(0.25), confidence_only: scores(0.1234) },
  results_label_only: { gate: scores(0), confidence_only: scores(0) },
  by_category: {},
  by_case_type: {},
  ambiguous: { n: 70, ids: [], note: "" },
} satisfies ApiAiEvaluation;

describe("independent evaluation adapter", () => {
  test("accepts the backend shape and rejects others", () => {
    expect(isAiEvaluation(sample)).toBe(true);
    expect(isAiEvaluation({ ...sample, limitations: undefined })).toBe(false);
    expect(isAiEvaluation({ ...sample, results: { gate: {} } })).toBe(false);
    expect(isAiEvaluation(null)).toBe(false);
  });

  test("chart rows are percentages for gate and baseline", () => {
    const rows = aiEvalRows(sample.results);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ metric: "Action accuracy", gate: 25, baseline: 12.3 });
  });

  test("kappa formatting keeps undefined kappa visible", () => {
    expect(fmtKappa(0.4)).toBe("0.40");
    expect(fmtKappa(-0.05)).toBe("-0.05");
    expect(fmtKappa(null)).toBe("undefined");
  });

  test("case type labels", () => {
    expect(caseTypeLabel("best_option_expensive_or_irreversible")).toBe(
      "Best option expensive or irreversible",
    );
  });
});
