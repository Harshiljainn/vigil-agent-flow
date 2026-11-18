export type Category =
  | "weather"
  | "geopolitical"
  | "labor"
  | "regulatory"
  | "health"
  | "cyber"
  | "supplier"
  | "telemetry";

export type Severity = "low" | "medium" | "high" | "critical";

export type ActionType =
  | "reroute"
  | "switch_supplier"
  | "split_order"
  | "expedite"
  | "buffer_stock"
  | "hedge"
  | "force_majeure"
  | "notify_only";

export type Status = "auto_executed" | "pending" | "approved" | "rejected";

export const CATEGORY_META: Record<Category, { label: string; color: string; agent: string }> = {
  weather: { label: "Weather", color: "var(--cat-weather)", agent: "weather-mcp" },
  geopolitical: { label: "Geopolitical", color: "var(--cat-geopolitical)", agent: "news-mcp" },
  labor: { label: "Labor", color: "var(--cat-labor)", agent: "news-mcp" },
  regulatory: { label: "Regulatory", color: "var(--cat-regulatory)", agent: "news-mcp" },
  health: { label: "Health", color: "var(--cat-health)", agent: "news-mcp" },
  cyber: { label: "Cyber", color: "var(--cat-cyber)", agent: "news-mcp" },
  supplier: { label: "Supplier Risk", color: "var(--cat-supplier)", agent: "supplychain-mcp" },
  telemetry: {
    label: "Shipment Telemetry",
    color: "var(--cat-telemetry)",
    agent: "supplychain-mcp",
  },
};

export const SEVERITY_META: Record<Severity, { label: string; color: string; rank: number }> = {
  low: { label: "Low", color: "var(--sev-low)", rank: 1 },
  medium: { label: "Medium", color: "var(--sev-medium)", rank: 2 },
  high: { label: "High", color: "var(--sev-high)", rank: 3 },
  critical: { label: "Critical", color: "var(--sev-critical)", rank: 4 },
};

export const ACTION_META: Record<ActionType, { label: string; reversible: boolean }> = {
  reroute: { label: "Reroute", reversible: true },
  switch_supplier: { label: "Switch Supplier", reversible: false },
  split_order: { label: "Split Order", reversible: true },
  expedite: { label: "Expedite", reversible: true },
  buffer_stock: { label: "Buffer Stock", reversible: true },
  hedge: { label: "Hedge", reversible: false },
  force_majeure: { label: "Force Majeure", reversible: false },
  notify_only: { label: "Notify Only", reversible: true },
};

export const IRREVERSIBLE_ACTIONS: ActionType[] = ["switch_supplier", "hedge", "force_majeure"];

export type Evidence = {
  agent: string;
  text: string;
  grounded: boolean;
};

export type MitigationOption = {
  id: string;
  action: ActionType;
  description: string;
  cost: number;
  delayReductionHours: number;
  /** Live data only: original backend action name, e.g. "reroute_shipment". */
  backendAction?: string;
  /** Live data only: per-option reversibility from the backend (overrides ACTION_META). */
  reversible?: boolean;
  /** Live data only: delay the option causes, in hours (backend delay_hours). */
  delayHours?: number;
  /** Live data only: recommendation confidence used by the gate, 0-100. */
  confidence?: number;
  /** Live data only: the backend's exact 0-1 confidence (the gate compares this value). */
  confidenceExact?: number;
};

export type Alert = {
  id: string;
  category: Category;
  severity: Severity;
  summary: string;
  confidence: number;
  createdAt: string;
  status: Status;
  shipments: string[];
  supplier: string;
  evidence: Evidence[];
  options: MitigationOption[];
  recommendedOptionId: string;
  /** Live data only: backend gives a count, not shipment IDs. */
  shipmentCount?: number;
  /** Live data only: seq of the gate's audit record (used for POST /queue/{seq}/review). */
  auditSeq?: number;
  /** Live data only: the Decision Gate's own reasons for its route. */
  gateReasons?: string[];
  /** Live data only: the Decision Gate's route for this alert. */
  route?: "auto_execute" | "human_review";
  /** Backend data only: "live" = built from real MCP signals, "synthetic" = generated scenario. */
  origin?: "live" | "synthetic";
  /** Live-signal alerts: the monitored port or lane. */
  location?: string;
  /** Live-signal alerts: MCP servers that failed during the fetch. */
  failedServers?: string[];
};

export const HUMANS = ["A. Mehta", "R. Iyer", "S. Fernandes", "K. Nair", "D. Kulkarni"];

export const DEFAULT_THRESHOLDS = { cost: 12000, confidence: 78 };

/** The fixed "now" of the demo (mock) data; demo times are relative to it. */
export const DEMO_NOW_MS = Date.UTC(2026, 8, 18, 9, 36);

const t = (hoursAgo: number) =>
  new Date(Date.UTC(2026, 8, 18, 9, 10) - hoursAgo * 3600_000).toISOString();

export const ALERTS: Alert[] = [
  {
    id: "ALT-1042",
    category: "labor",
    severity: "critical",
    summary: "Port strike risk affecting 3 shipments via Chennai route",
    confidence: 91,
    createdAt: t(0.4),
    status: "pending",
    shipments: ["SHP-88213", "SHP-88240", "SHP-88301"],
    supplier: "Kaveri Components Pvt Ltd",
    evidence: [
      {
        agent: "news-mcp",
        text: "Dockworkers' union announced 72h stoppage notice at Chennai Port from Sep 19.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "3 containers scheduled for Chennai berth within the strike window.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Similar 2024 strike (past_incident_047) delayed comparable lanes by 96h.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1042-A",
        action: "reroute",
        description: "Divert 3 containers to Krishnapatnam Port with road leg to Chennai DC.",
        cost: 14200,
        delayReductionHours: 72,
      },
      {
        id: "OPT-1042-B",
        action: "split_order",
        description: "Split order: air-freight 20% critical SKUs, hold remainder at origin.",
        cost: 22800,
        delayReductionHours: 54,
      },
      {
        id: "OPT-1042-C",
        action: "notify_only",
        description: "Notify customers of 4-day slip, no physical intervention.",
        cost: 0,
        delayReductionHours: 0,
      },
    ],
    recommendedOptionId: "OPT-1042-A",
  },
  {
    id: "ALT-1041",
    category: "weather",
    severity: "high",
    summary: "Cyclone Dhruv track threatens Bay of Bengal transit for 5 shipments",
    confidence: 88,
    createdAt: t(1.1),
    status: "auto_executed",
    shipments: ["SHP-88177", "SHP-88190", "SHP-88199", "SHP-88204", "SHP-88221"],
    supplier: "Bengal Marine Forwarders",
    evidence: [
      {
        agent: "weather-mcp",
        text: "IMD severe cyclone warning, sustained winds 120 km/h, landfall in 38h.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "5 vessels inside forecast cone; 2 already reduced speed to 8 kn.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Weather playbook recommends 48h pre-landfall buffer for this lane.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1041-A",
        action: "buffer_stock",
        description: "Release 4 days of safety stock at Kolkata DC to cover the gap.",
        cost: 4100,
        delayReductionHours: 40,
      },
      {
        id: "OPT-1041-B",
        action: "reroute",
        description: "Hold vessels at Visakhapatnam anchorage until the cone clears.",
        cost: 9300,
        delayReductionHours: 26,
      },
    ],
    recommendedOptionId: "OPT-1041-A",
  },
  {
    id: "ALT-1040",
    category: "telemetry",
    severity: "medium",
    summary: "Reefer temperature drift on SHP-88112 exceeds 2°C tolerance",
    confidence: 96,
    createdAt: t(2.2),
    status: "auto_executed",
    shipments: ["SHP-88112"],
    supplier: "ColdLink Logistics",
    evidence: [
      {
        agent: "supplychain-mcp",
        text: "Reefer setpoint 4°C, last 6 readings averaged 6.4°C and rising.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Cold-chain playbook: notify carrier + schedule inspection under 8°C breach.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1040-A",
        action: "notify_only",
        description: "Alert carrier ops and flag unit for inspection at next port call.",
        cost: 180,
        delayReductionHours: 0,
      },
      {
        id: "OPT-1040-B",
        action: "expedite",
        description: "Expedite discharge to shorten exposure window by 11h.",
        cost: 2600,
        delayReductionHours: 11,
      },
    ],
    recommendedOptionId: "OPT-1040-A",
  },
  {
    id: "ALT-1039",
    category: "supplier",
    severity: "critical",
    summary: "Tier-2 supplier Anhui Precision shows severe financial distress signals",
    confidence: 74,
    createdAt: t(3.5),
    status: "pending",
    shipments: ["SHP-88021", "SHP-88044"],
    supplier: "Anhui Precision Metals",
    evidence: [
      {
        agent: "supplychain-mcp",
        text: "Credit score dropped 611 -> 488 in 30 days; two late-payment filings.",
        grounded: false,
      },
      {
        agent: "news-mcp",
        text: "Local press reports plant running single shift since Aug 28.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Playbook: dual-source before distress score crosses 0.7 (currently 0.76).",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1039-A",
        action: "switch_supplier",
        description: "Shift 60% of volume to qualified alternate Hanoi Precision Works.",
        cost: 31500,
        delayReductionHours: 120,
      },
      {
        id: "OPT-1039-B",
        action: "buffer_stock",
        description: "Build 6-week buffer of affected SKUs while monitoring.",
        cost: 18400,
        delayReductionHours: 60,
      },
    ],
    recommendedOptionId: "OPT-1039-A",
  },
  {
    id: "ALT-1038",
    category: "geopolitical",
    severity: "high",
    summary: "Red Sea transit advisory raised; 4 shipments on Suez routing",
    confidence: 83,
    createdAt: t(5),
    status: "pending",
    shipments: ["SHP-87990", "SHP-87994", "SHP-88002", "SHP-88010"],
    supplier: "Levant Freight Alliance",
    evidence: [
      {
        agent: "news-mcp",
        text: "Two carriers suspended Bab-el-Mandeb transits after overnight incident.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "4 bookings still routed via Suez with ETA inside the advisory window.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Cape reroute added 12-14 days in past_incident_031 at +18% freight.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1038-A",
        action: "reroute",
        description: "Reroute via Cape of Good Hope, accept 12-day extension.",
        cost: 27600,
        delayReductionHours: 0,
      },
      {
        id: "OPT-1038-B",
        action: "hedge",
        description: "Lock war-risk premium and forward freight rate for Q4 volume.",
        cost: 41000,
        delayReductionHours: 0,
      },
      {
        id: "OPT-1038-C",
        action: "split_order",
        description: "Split: air-freight high-margin SKUs, sea for the rest.",
        cost: 19800,
        delayReductionHours: 180,
      },
    ],
    recommendedOptionId: "OPT-1038-C",
  },
  {
    id: "ALT-1037",
    category: "cyber",
    severity: "high",
    summary: "Ransomware outage at 3PL WMS provider halts outbound picking",
    confidence: 86,
    createdAt: t(7),
    status: "pending",
    shipments: ["SHP-87950", "SHP-87961"],
    supplier: "NorthGate 3PL",
    evidence: [
      {
        agent: "news-mcp",
        text: "Provider status page reports encrypted WMS cluster; ETA unknown.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "No scan events from Pune DC for 4h 20m (baseline: every 6 min).",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Cyber playbook: fail over to manual pick lists beyond 4h silence.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1037-A",
        action: "expedite",
        description: "Manual pick-list fallback plus overtime shift at Pune DC.",
        cost: 8700,
        delayReductionHours: 22,
      },
      {
        id: "OPT-1037-B",
        action: "reroute",
        description: "Divert outbound volume to Nashik DC for 48h.",
        cost: 15200,
        delayReductionHours: 30,
      },
    ],
    recommendedOptionId: "OPT-1037-A",
  },
  {
    id: "ALT-1036",
    category: "regulatory",
    severity: "medium",
    summary: "New EU battery-passport documentation required from Oct 1",
    confidence: 79,
    createdAt: t(9),
    status: "auto_executed",
    shipments: ["SHP-87900"],
    supplier: "Iberia Cells S.A.",
    evidence: [
      {
        agent: "news-mcp",
        text: "Regulation update indexed: declaration of conformity now mandatory at entry.",
        grounded: true,
      },
      {
        agent: "SynthesizerAgent",
        text: "Compliance playbook: pre-file docs 10 days before first affected sailing.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1036-A",
        action: "notify_only",
        description: "Notify supplier compliance desk and request passport dossier.",
        cost: 900,
        delayReductionHours: 0,
      },
    ],
    recommendedOptionId: "OPT-1036-A",
  },
  {
    id: "ALT-1035",
    category: "health",
    severity: "medium",
    summary: "Dengue outbreak reduces workforce at Surat packaging vendor",
    confidence: 71,
    createdAt: t(12),
    status: "rejected",
    shipments: ["SHP-87881"],
    supplier: "Surat Pack Industries",
    evidence: [
      {
        agent: "news-mcp",
        text: "District health bulletin: 31% spike in cases, factory absenteeism ~18%.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "Vendor confirmed output at 82% of committed capacity this week.",
        grounded: false,
      },
    ],
    options: [
      {
        id: "OPT-1035-A",
        action: "split_order",
        description: "Split packaging order with Vapi secondary vendor.",
        cost: 6400,
        delayReductionHours: 24,
      },
      {
        id: "OPT-1035-B",
        action: "buffer_stock",
        description: "Draw down packaging buffer for two weeks.",
        cost: 1900,
        delayReductionHours: 12,
      },
    ],
    recommendedOptionId: "OPT-1035-A",
  },
  {
    id: "ALT-1034",
    category: "weather",
    severity: "low",
    summary: "Fog advisory may slow North India trucking corridor overnight",
    confidence: 68,
    createdAt: t(15),
    status: "auto_executed",
    shipments: ["SHP-87860", "SHP-87864"],
    supplier: "Grand Trunk Carriers",
    evidence: [
      {
        agent: "weather-mcp",
        text: "Visibility forecast under 200 m between 02:00-07:00 on NH-44.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "2 trucks projected inside the window; slack of 9h in both ETAs.",
        grounded: false,
      },
    ],
    options: [
      {
        id: "OPT-1034-A",
        action: "notify_only",
        description: "Notify carrier to shift departure two hours later.",
        cost: 120,
        delayReductionHours: 3,
      },
    ],
    recommendedOptionId: "OPT-1034-A",
  },
  {
    id: "ALT-1033",
    category: "telemetry",
    severity: "low",
    summary: "GPS ping gap of 90 minutes on SHP-87842 near Nagpur",
    confidence: 93,
    createdAt: t(18),
    status: "auto_executed",
    shipments: ["SHP-87842"],
    supplier: "Central India Roadways",
    evidence: [
      {
        agent: "supplychain-mcp",
        text: "Telematics silence 90 min, resumed on-route with 12 min ETA slip.",
        grounded: false,
      },
    ],
    options: [
      {
        id: "OPT-1033-A",
        action: "notify_only",
        description: "Log signal gap, no mitigation required.",
        cost: 0,
        delayReductionHours: 0,
      },
    ],
    recommendedOptionId: "OPT-1033-A",
  },
  {
    id: "ALT-1032",
    category: "geopolitical",
    severity: "critical",
    summary: "Export licence suspension risk for rare-earth magnets from Ningbo",
    confidence: 76,
    createdAt: t(22),
    status: "pending",
    shipments: ["SHP-87800", "SHP-87812", "SHP-87830"],
    supplier: "Ningbo MagTech",
    evidence: [
      {
        agent: "news-mcp",
        text: "Ministry consultation draft adds magnet grade N52 to controlled list.",
        grounded: false,
      },
      {
        agent: "news-mcp",
        text: "Three open POs reference N52 grade with shipment after Oct 5.",
        grounded: true,
      },
      {
        agent: "SynthesizerAgent",
        text: "past_incident_012: licence gap stalled lane for 5 weeks.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1032-A",
        action: "force_majeure",
        description: "Invoke force majeure clause on two downstream contracts.",
        cost: 46000,
        delayReductionHours: 0,
      },
      {
        id: "OPT-1032-B",
        action: "expedite",
        description: "Expedite pre-control shipment of all three POs this week.",
        cost: 23400,
        delayReductionHours: 600,
      },
    ],
    recommendedOptionId: "OPT-1032-B",
  },
  {
    id: "ALT-1031",
    category: "supplier",
    severity: "medium",
    summary: "On-time delivery for Kaveri Components fell to 71% over 30 days",
    confidence: 82,
    createdAt: t(27),
    status: "auto_executed",
    shipments: ["SHP-87760"],
    supplier: "Kaveri Components Pvt Ltd",
    evidence: [
      {
        agent: "supplychain-mcp",
        text: "OTD 71% vs 94% contractual; 4 of 14 lines late by >3 days.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Scorecard playbook: issue corrective-action request below 80% OTD.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1031-A",
        action: "notify_only",
        description: "Raise corrective-action request and weekly review cadence.",
        cost: 400,
        delayReductionHours: 0,
      },
      {
        id: "OPT-1031-B",
        action: "split_order",
        description: "Move 25% of volume to backup supplier for one quarter.",
        cost: 11200,
        delayReductionHours: 48,
      },
    ],
    recommendedOptionId: "OPT-1031-A",
  },
  {
    id: "ALT-1030",
    category: "labor",
    severity: "high",
    summary: "Rail-union work-to-rule slows inland haulage from Mundra",
    confidence: 80,
    createdAt: t(31),
    status: "pending",
    shipments: ["SHP-87700", "SHP-87714"],
    supplier: "Westline Rail Logistics",
    evidence: [
      {
        agent: "news-mcp",
        text: "Union notice: strict rulebook working from Sep 19, ~30% slower turnarounds.",
        grounded: false,
      },
      {
        agent: "supplychain-mcp",
        text: "Dwell time at Mundra ICD already up from 14h to 26h.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Playbook favours road bridging when rail dwell exceeds 24h.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1030-A",
        action: "reroute",
        description: "Road-bridge two blocks to Ahmedabad hub instead of rail.",
        cost: 13100,
        delayReductionHours: 34,
      },
      {
        id: "OPT-1030-B",
        action: "buffer_stock",
        description: "Hold and use in-country buffer for 10 days.",
        cost: 5200,
        delayReductionHours: 16,
      },
    ],
    recommendedOptionId: "OPT-1030-A",
  },
  {
    id: "ALT-1029",
    category: "cyber",
    severity: "medium",
    summary: "Phishing campaign targeting supplier invoice channel detected",
    confidence: 84,
    createdAt: t(36),
    status: "auto_executed",
    shipments: [],
    supplier: "Multiple (12 vendors)",
    evidence: [
      {
        agent: "news-mcp",
        text: "9 lookalike domains registered against supplier-portal namespace.",
        grounded: false,
      },
      {
        agent: "SynthesizerAgent",
        text: "Cyber playbook: freeze bank-detail changes and broadcast advisory.",
        grounded: true,
      },
    ],
    options: [
      {
        id: "OPT-1029-A",
        action: "notify_only",
        description: "Broadcast advisory and freeze bank-detail edits for 7 days.",
        cost: 650,
        delayReductionHours: 0,
      },
    ],
    recommendedOptionId: "OPT-1029-A",
  },
  {
    id: "ALT-1028",
    category: "regulatory",
    severity: "high",
    summary: "Customs valuation query holds 2 consignments at Nhava Sheva",
    confidence: 77,
    createdAt: t(42),
    status: "pending",
    shipments: ["SHP-87650", "SHP-87652"],
    supplier: "Iberia Cells S.A.",
    evidence: [
      {
        agent: "news-mcp",
        text: "Assessing officer requested transaction-value substantiation for HS 8507.",
        grounded: true,
      },
      {
        agent: "supplychain-mcp",
        text: "Both containers held 38h; demurrage starts in 10h.",
        grounded: false,
      },
    ],
    options: [
      {
        id: "OPT-1028-A",
        action: "expedite",
        description: "Engage broker for same-day document submission and release.",
        cost: 4300,
        delayReductionHours: 30,
      },
      {
        id: "OPT-1028-B",
        action: "hedge",
        description: "Post provisional duty bond to release under protest.",
        cost: 17500,
        delayReductionHours: 36,
      },
    ],
    recommendedOptionId: "OPT-1028-A",
  },
  {
    id: "ALT-1027",
    category: "health",
    severity: "low",
    summary: "Seasonal flu advisory at Hanoi assembly site, minor capacity dip",
    confidence: 66,
    createdAt: t(48),
    status: "auto_executed",
    shipments: ["SHP-87600"],
    supplier: "Hanoi Precision Works",
    evidence: [
      {
        agent: "news-mcp",
        text: "Provincial advisory issued; vendor reports 6% absenteeism.",
        grounded: false,
      },
    ],
    options: [
      {
        id: "OPT-1027-A",
        action: "notify_only",
        description: "Monitor weekly capacity confirmation, no action.",
        cost: 0,
        delayReductionHours: 0,
      },
    ],
    recommendedOptionId: "OPT-1027-A",
  },
];

export type Decision = {
  id: string;
  alertId: string;
  timestamp: string;
  category: Category;
  action: ActionType;
  mode: "auto" | "human";
  human: string | null;
  cost: number;
  confidence: number;
  status: "auto_executed" | "approved" | "rejected" | "pending";
  outcome: "correct" | "incorrect" | "pending";
  /** Original backend action name (live data). */
  backendAction?: string;
  /** Set when the reviewer approved a different option than the one recommended. */
  override?: { recommended: string; chosen: string };
  /** Reviewer's free-text note. */
  note?: string;
  /** Live data only: backend reversibility of the shown action. */
  reversible?: boolean;
  /** Live data only: the gate's route for this decision. */
  route?: "auto_execute" | "human_review";
  /** Live data only: which reasoning backend produced the agents' output. */
  reasoning?: ReasoningSource;
  /** Live data only: when the human review was stored (UTC ISO). */
  reviewedAt?: string;
  /** Live data only: seconds from escalation to the human review. */
  timeToDecisionS?: number;
};

/** Which backend wrote the Synthesizer/Strategist reasoning (live data only). */
export type ReasoningSource = {
  backend: "rule" | "gemini";
  model: string | null;
  fallback: boolean;
  fallbackReason: string | null;
};

// Deterministic pseudo-random generator so the seeded history never shifts.
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];
const ACTIONS = Object.keys(ACTION_META) as ActionType[];

function buildHistory(): Decision[] {
  const rnd = mulberry(20260918);
  const rows: Decision[] = [];
  for (let i = 0; i < 48; i++) {
    const category = CATEGORIES[Math.floor(rnd() * CATEGORIES.length)]!;
    const action = ACTIONS[Math.floor(rnd() * ACTIONS.length)]!;
    const irreversible = IRREVERSIBLE_ACTIONS.includes(action);
    const confidence = Math.round(58 + rnd() * 41);
    const cost = Math.round((irreversible ? 9000 + rnd() * 38000 : rnd() * 26000) / 50) * 50;
    const auto =
      !irreversible &&
      cost <= DEFAULT_THRESHOLDS.cost &&
      confidence >= DEFAULT_THRESHOLDS.confidence;
    const accuracyByCategory: Record<Category, number> = {
      telemetry: 0.96,
      weather: 0.92,
      regulatory: 0.87,
      cyber: 0.85,
      labor: 0.83,
      health: 0.8,
      geopolitical: 0.78,
      supplier: 0.71,
    };
    const correct = rnd() < accuracyByCategory[category];
    rows.push({
      id: `DEC-${2400 - i}`,
      alertId: `ALT-${1026 - i}`,
      timestamp: t(52 + i * 3.4),
      category,
      action,
      mode: auto ? "auto" : "human",
      human: auto ? null : HUMANS[Math.floor(rnd() * HUMANS.length)]!,
      cost,
      confidence,
      status: auto ? "auto_executed" : rnd() < 0.78 ? "approved" : "rejected",
      outcome: rnd() < 0.08 ? "pending" : correct ? "correct" : "incorrect",
    });
  }
  return rows;
}

export const DECISION_HISTORY: Decision[] = buildHistory();

export function seedDecisionsFromAlerts(): Decision[] {
  return ALERTS.filter((a) => a.status !== "pending").map((a, i) => {
    const opt = a.options.find((o) => o.id === a.recommendedOptionId)!;
    return {
      id: `DEC-${2450 + i}`,
      alertId: a.id,
      timestamp: a.createdAt,
      category: a.category,
      action: opt.action,
      mode: a.status === "rejected" ? "human" : "auto",
      human: a.status === "rejected" ? HUMANS[i % HUMANS.length]! : null,
      cost: a.status === "rejected" ? 0 : opt.cost,
      confidence: a.confidence,
      status: a.status === "rejected" ? "rejected" : "auto_executed",
      outcome: a.status === "rejected" ? "correct" : i % 7 === 3 ? "incorrect" : "correct",
    };
  });
}
