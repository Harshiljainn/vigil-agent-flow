# VigilAI Command Center

Build a web app called "VigilAI" — a human-in-the-loop, multi-agent AI

command center for supply chain disruption response. This is a demo build

for a college major-project presentation: use realistic, comprehensive mock

data everywhere so every screen looks fully alive with no backend required.

Store all mock data as static/seed data in the frontend and let interactions

(approve/reject, slider drags, filters) update local state so the demo feels

real and live.

=== VISUAL DIRECTION ===

Modern "mission control" enterprise dashboard aesthetic — think Linear,

Vercel, or a NASA ops-room feel, not a generic admin template. Dark theme by

default (deep navy/charcoal background, e.g. #0B0F17) with a light-theme

toggle. Clean sans-serif typography (Inter or similar). Generous whitespace,

rounded cards with subtle borders/glow, no heavy skeuomorphism.

Give each disruption category a fixed accent color used consistently

everywhere (badges, chart bars, agent icons):

- Weather -> blue

- Geopolitical -> red

- Labor -> orange

- Regulatory/Compliance -> purple

- Health -> pink

- Cyber -> cyan

- Supplier Risk -> yellow

- Shipment Telemetry -> green

Severity levels (low/medium/high/critical) use a consistent grey->yellow->

orange->red intensity scale, separate from the category color, shown as a

small dot or left-border stripe on cards so category and severity are both

visible at a glance without colliding.

=== NAVIGATION ===

Left sidebar, collapsible, with icons + labels for each page below, plus the

"VigilAI" logo/wordmark and a tagline "Agentic Disruption Response, with a

Human in the Loop" at the top. Under the logo, show small static badges:

"LLM Agents" · "RAG" · "MCP" · "Human-in-the-Loop" — these badges should be

visible on every page (small, top-right of the header bar) since they're the

core technologies being demonstrated.

=== PAGE 1: Overview / Command Center (default landing page) ===

Top row of 5 KPI cards: "Active Alerts", "Decisions Today", "% Auto-Executed",

"% Escalated to Human", "Est. Human Hours Saved This Week". Use large bold

numbers with a small trend arrow (up/down vs last week).

Below that, a two-column layout:

- Left (60% width): a live-feed style list of the 5 most recent alerts

  (reuse the alert card component from Page 2), auto-labeled "Live Feed"

  with a pulsing green dot.

- Right (40% width): a donut chart of alerts by disruption category (using

  the 8 category colors) and a small bar chart of decisions by action type

  (reroute, switch supplier, split order, expedite, buffer stock, hedge,

  force majeure, notify only).

=== PAGE 2: Live Alert Feed ===

A filterable, scrollable list of alert cards. Filter bar at top: dropdown

for category (all 8), dropdown for severity, and a search box.

Each alert card shows:

- Category badge (colored) + severity indicator

- One-line alert summary (e.g. "Port strike risk affecting 3 shipments via

  Chennai route")

- Confidence score as a small horizontal bar (0-100%)

- "Evidence" — an expandable section listing 2-4 short evidence bullets,

  each tagged with which agent produced it (e.g. "GeoNewsAgent",

  "ShipmentTelemetryAgent") and a small icon indicating it was

  RAG-grounded (a small "grounded" badge) vs live-signal-only

- "Proposed Mitigation Options" — 1-3 mini cards, each showing the action

  type, a one-line description, estimated cost, estimated delay reduction,

  and a "reversible" / "irreversible" tag

- A status pill: "Auto-Executed" (green) / "Pending Human Review" (amber) /

  "Rejected" (red)

Include at least 12-15 seeded mock alerts spanning ALL 8 disruption

categories and a mix of severities, so filtering actually demonstrates

something. Include a few multi-signal alerts (e.g. one alert whose evidence

combines both WeatherAgent and ShipmentTelemetryAgent) to show the fusion

capability.

=== PAGE 3: Agent Pipeline / Reasoning Trace (this is the most important

page for the presentation — it should visually prove the multi-agent + RAG

+ MCP architecture) ===

A horizontal pipeline diagram at the top showing boxes for each stage, left

to right, connected by arrows:

  [WeatherAgent] [GeoNewsAgent] [ShipmentTelemetryAgent] [SupplierRiskAgent]

        -> [SynthesizerAgent] -> [StrategistAgent] -> [Decision Gate]

        -> [CommunicationAgent]

Each box should be clickable. Clicking a box highlights it and shows a

detail panel below with:

- What this agent/module does (1-2 sentences)

- Which MCP server / tool it calls (show the literal tool name, e.g.

  "weather-mcp.get_severe_weather_alerts(region)")

- For LLM agents: a sample "reasoning trace" — a short mock transcript

  showing retrieved RAG context (with a "Retrieved from: past_incident_047,

  logistics_playbook_weather.md" citation) and the structured JSON it

  produced

- For the Decision Gate specifically: show the actual threshold values

  currently set, the reversibility lookup table, and a worked example of

  one alert going through the gate step by step (cost check -> confidence

  check -> reversibility override -> final verdict)

Add a "Play" button that animates a token/pulse traveling left to right

through the pipeline for one example alert, to make this feel dynamic

during the live demo.

=== PAGE 4: Decision Queue (Human-in-the-Loop) ===

A queue of alerts currently awaiting human review (status = pending). Each

row expands into: the alert summary, the recommended mitigation option

(highlighted as "Recommended"), the alternative options, cost/confidence/

reversibility values, and three buttons: "Approve", "Reject", "Modify &

Approve" (opens a small edit panel to change the chosen action before

approving). Approving/rejecting should move the item out of the queue and

into the Audit Log with the correct status, updating the Page 1 KPIs live.

Show a small explanatory banner at the top: "These items exceeded the

current cost/confidence threshold, or involve an irreversible action, so

they require your sign-off" — this line matters for explaining the design

to your professor without you having to say it out loud.

=== PAGE 5: Threshold Control Panel ===

Two large sliders: "Cost Threshold" ($0 - $50,000) and "Confidence

Threshold" (0-100%). As the user drags either slider, live-update:

- A count: "X of the last 50 decisions would flip from Auto to Escalate"

  (and vice versa) — compute this against the seeded mock decision history

- A small live-updating mini chart showing the auto vs escalate split at

  the current threshold values

Below the sliders, show the fixed "Irreversible Action Override" list

(switch_supplier, hedge, force_majeure) with a note that these always

escalate regardless of where the sliders are set — with the sliders

visually "grayed out"/disabled-looking for rows matching those action

types in the mini chart, to make the override visually obvious.

=== PAGE 6: Audit Log ===

A dense, searchable/sortable table: timestamp, alert category, action

taken, auto or human, human name (or "—" if auto), cost, outcome (correct/

incorrect/pending — from evaluation ground truth where available), and a

"View trace" link that opens the same reasoning-trace detail panel used on

Page 3, scoped to that specific decision. Include column filters and a

date-range picker. Seed at least 40-50 historical rows so the table feels

real and sorting/filtering has something to show.

=== PAGE 7: Evaluation & Analytics ===

This page presents the "research result" of the project, so make it look

like a results section, not just another dashboard:

- A large line/scatter chart: X-axis = decision threshold setting, Y-axis

  = two lines, "Human workload (%)" and "Cost of auto-approval errors

  ($)" — the classic Pareto trade-off curve. Add an annotation marking the

  "recommended" threshold point.

- A grouped bar chart: accuracy broken down by disruption category (all 8),

  showing that some categories (e.g. Shipment Telemetry) are easier to

  auto-approve correctly than others (e.g. Supplier Risk) — this

  per-category breakdown is a key talking point.

- A summary stat row: "Total decisions evaluated", "Overall accuracy",

  "Human hours saved (estimated)", "Errors caught before execution"

=== PAGE 8: System Architecture (static, for explaining the design) ===

A single clean architecture diagram (can be built with SVG/HTML boxes and

lines, doesn't need to be interactive) showing:

- The 4 MCP servers (weather-mcp, news-mcp, supplychain-mcp, notify-mcp) as

  a row of boxes at the bottom

- The RAG knowledge base (ChromaDB icon/box) to one side, with dotted lines

  showing which agents query it (SynthesizerAgent, StrategistAgent,

  CommunicationAgent)

- The 7 agents + Decision Gate in the middle, in their pipeline order

- The SQLite database as a cylinder icon receiving writes from every stage

- The dashboard (this app) on top, reading from the database

Add a short caption under the diagram: "LLM Agents · Retrieval-Augmented

Generation · Model Context Protocol · Human-in-the-Loop Decision Gating"

=== INTERACTION / MOCK DATA NOTES ===

- Use a consistent mock dataset across all pages (same alert IDs, same

  supplier names, same shipment IDs) so numbers are internally consistent

  if your professor cross-checks Page 1's KPIs against Page 6's audit log.

- Approve/Reject actions on Page 4 should visibly affect Page 1 and Page 6

  in real time (client-side state update) to demonstrate interactivity

  during a live demo, not just static screens.

- Include a few "obviously irreversible, correctly escalated" examples and

  a few "low-cost, correctly auto-approved" examples so both halves of the

  Decision Gate logic are visibly demonstrated somewhere in the seed data.

=== TECH ===

React + Tailwind. Use a charting library (Recharts) for all charts. Use

lucide-react icons for the sidebar and agent pipeline. No backend/database

integration needed for this build — everything runs on seeded local state.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cb0b823b-0ac9-4542-8865-9df81e6fd67d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
