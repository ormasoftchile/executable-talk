# TSG Executor: Intelligent Incident Response for VS Code

**Author:** [Your Name]  
**Date:** January 29, 2026  
**Status:** Draft  
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Target User Persona](#target-user-persona)
4. [Success Criteria](#success-criteria)
5. [Proposed Solution](#proposed-solution)
6. [Architecture](#architecture)
7. [Execution Overlay Specification](#execution-overlay-specification)
8. [Workflow Integration](#workflow-integration)
9. [GitHub Copilot SDK Integration](#github-copilot-sdk-integration)
10. [Safety & Auditability Framework](#safety--auditability-framework)
11. [Learning from Execution Paths](#learning-from-execution-paths)
12. [Implementation Roadmap](#implementation-roadmap)
13. [Success Metrics](#success-metrics)
14. [Risks & Mitigations](#risks--mitigations)
15. [Appendix](#appendix)

---

## Executive Summary

TSG Executor is a VS Code extension that transforms static Troubleshooting Guides (TSGs) into **executable runbooks** without modifying the original documentation. This addresses a critical gap in incident response: DRIs waste precious minutes context-switching between docs, terminals, and monitoring tools during high-stress SEV1/SEV2 incidents.

The **Execution Overlay** architecture respects the existing documentation investment while enabling progressive automation enhancement. A novel **learning component** captures execution paths to continuously improve TSG quality and provide predictive guidance to future DRIs.

---

## Problem Statement

### The DRI Cognitive Load Crisis

Research from Google's SRE practices and Microsoft's incident retrospectives consistently shows:

| Metric | Impact |
|--------|--------|
| **Context switches per incident** | 15-30 tool/window switches |
| **Time finding correct TSG** | 5-15 minutes (20-40% of MTTR) |
| **Command copy-paste errors** | 12% of incidents involve execution mistakes |
| **Documentation drift** | 30% of TSGs are outdated within 6 months |

### Current State Challenges

1. **Thousands of TSGs exist** — Manual migration to executable format is impractical
2. **TSGs contain images** — Flowcharts and screenshots hold critical instructions
3. **No execution context** — DRIs manually substitute hostnames, namespaces, pod names
4. **No feedback loop** — No visibility into which TSG steps are actually useful

---

## Target User Persona

### The High-Stress DRI

The target user is a **Designated Responsible Individual (DRI)** or **Site Reliability Engineer (SRE)**.

| Attribute | Description |
|-----------|-------------|
| **Context** | Operating under extreme time pressure during SEV1/SEV2 livesite incidents |
| **Pain Points** | Cognitive overload from tool switching; fear of "fat-fingering" commands; difficulty finding the correct, up-to-date TSG |
| **Need** | A "guided execution" environment with safe, context-aware automation while retaining control |
| **Success State** | Resolve incidents faster with fewer errors and full auditability |

---

## Success Criteria

| Criterion | Description | Target |
|-----------|-------------|--------|
| **Zero-Touch Integration** | Function without modifying existing TSG library | 100% |
| **Context Hydration** | Auto-populate variables from incident system | Full automation |
| **MTTR Reduction** | Mean Time To Resolution improvement | 20-30% reduction |
| **Safety & Auditability** | Every command logged with DRI identity and incident ID | 100% coverage |
| **Resilience to Drift** | Detect TSG updates since metadata verification | Automatic flagging |
| **Learning Capture** | Record execution paths for optimization | 100% of executions |

---

## Proposed Solution

### The Execution Overlay Architecture

To enhance TSGs without modifying them, use an **Execution Overlay** approach:

- For every `troubleshooting-guide.md`, create a corresponding `troubleshooting-guide.overlay.json`
- Store overlays in a parallel directory or dedicated "Automation" repository
- Map Markdown headers or image paths as "keys" to executable commands

### Key Capabilities

1. **Deep Linking** — Incident system generates `vscode://` links with full context
2. **Context Hydration** — Automatic variable substitution from incident metadata
3. **AI Enhancement** — Copilot SDK for command suggestion and output summarization
4. **Image Interpretation** — Vision API extracts intent from diagram-based TSGs
5. **Execution Learning** — Capture and analyze DRI execution paths

---

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│  Incident Management System (PagerDuty/ServiceNow/Custom)  │
│  └── Generates vscode:// deep links with incident context  │
└─────────────────────────┬───────────────────────────────────┘
                          │ URI Protocol Handler
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  TSG Executor Extension                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Webview Layer   │  │ Conductor Layer │  │ VS Code API │ │
│  │ - TSG Renderer  │◄─┤ - Context Hydra │──┤ - Terminal  │ │
│  │ - Run Controls  │  │ - Overlay Loader│  │ - Debugger  │ │
│  │ - Output Panel  │  │ - Audit Logger  │  │ - Workspace │ │
│  │ - Path Tracker  │  │ - Path Recorder │  │ - Files     │ │
│  └─────────────────┘  └────────┬────────┘  └─────────────┘ │
└────────────────────────────────┼────────────────────────────┘
                                 │ API Calls
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Copilot SDK / Azure OpenAI                          │
│  - Intent extraction from text/images                       │
│  - Command suggestion for un-annotated steps                │
│  - Output summarization and anomaly detection               │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Learning Pipeline                                           │
│  - Execution path storage                                    │
│  - Path frequency analysis                                   │
│  - Step efficacy scoring                                     │
│  - Predictive guidance generation                            │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Webview Layer** | Render TSG with executable controls; display suggested paths |
| **Conductor Layer** | Orchestrate execution; manage state; record execution paths |
| **VS Code API Layer** | Terminal execution; file operations; debug sessions |
| **Copilot SDK** | Command suggestion; output summarization; image interpretation |
| **Learning Pipeline** | Path storage; pattern analysis; optimization recommendations |

---

## Execution Overlay Specification

### Schema Definition

```json
{
  "$schema": "https://your-org/tsg-overlay.schema.json",
  "version": "1.0",
  "tsg_path": "database/connectivity.md",
  "tsg_hash": "sha256:abc123...",
  "last_verified": "2026-01-15T10:00:00Z",
  "verified_by": "alice@contoso.com",
  "steps": [
    {
      "anchor": "## Step 1: Check App Service Status",
      "type": "diagnostic",
      "command": "az webapp show --name ${incident.app_name} --resource-group ${incident.resource_group} --query state",
      "timeout_seconds": 30,
      "expected_output_pattern": "Running",
      "failure_hint": "If app not found, verify resource group and app name"
    },
    {
      "anchor": "![Restart Flow](images/restart-flow.png)",
      "type": "remediation",
      "command": "az webapp restart --name ${incident.app_name} --resource-group ${incident.resource_group}",
      "is_destructive": true,
      "requires_dry_run": true,
      "approval_required": ["on-call-lead"]
    }
  ],
  "context_requirements": ["resource_group", "app_name", "subscription_id"]
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Overlay schema version |
| `tsg_path` | string | Yes | Relative path to the TSG markdown file |
| `tsg_hash` | string | Yes | SHA256 hash for drift detection |
| `last_verified` | string | Yes | ISO 8601 timestamp of last verification |
| `verified_by` | string | Yes | Email of engineer who verified the overlay |
| `steps` | array | Yes | Array of executable step definitions |
| `context_requirements` | array | Yes | Required incident context variables |

### Step Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `anchor` | string | Yes | Markdown header or image path to match |
| `type` | enum | Yes | `diagnostic`, `remediation`, `escalation` |
| `command` | string | Yes | Command with `${variable}` placeholders |
| `timeout_seconds` | number | No | Execution timeout (default: 60) |
| `is_destructive` | boolean | No | Requires extra confirmation |
| `requires_dry_run` | boolean | No | Must run dry-run first |
| `approval_required` | array | No | Roles that must approve |
| `expected_output_pattern` | string | No | Regex to validate success |
| `failure_hint` | string | No | Guidance when step fails |

---

## Workflow Integration

### Deep Link Protocol

```
vscode://tsg-executor.open?
  incidentId=INC-12345
  &tsgPath=database/connectivity.md
  &subscription_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890
  &resource_group=prod-east-rg
  &app_name=api-gateway-prod
  &severity=SEV1
  &driEmail=alice@contoso.com
```

### Incident System Integration Flow

```
┌──────────────────────┐
│  Incident Created    │
│  (PagerDuty/SNOW)    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  AI suggests TSGs    │
│  based on service,   │
│  error patterns      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  DRI clicks deep     │
│  link in portal      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  VS Code opens with  │
│  TSG + full context  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  DRI executes steps  │
│  Path is recorded    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Resolution logged   │
│  Path sent to learn  │
└──────────────────────┘
```

---

## GitHub Copilot SDK Integration

### Integration Points

#### 1. Intent-to-Command Extraction

For TSG steps without overlay annotations, DRIs can highlight text and request command suggestions:

```typescript
async function extractCommandIntent(
  selectedText: string, 
  incidentContext: IncidentContext
): Promise<CommandSuggestion> {
  const response = await copilot.chat({
    messages: [
      {
        role: "system",
        content: `You are an SRE assistant. Given troubleshooting instructions, 
                  suggest a safe diagnostic command. Context: 
                  namespace=${incidentContext.namespace}, 
                  service=${incidentContext.service}`
      },
      { role: "user", content: selectedText }
    ]
  });
  return parseCommandSuggestion(response);
}
```

#### 2. Image Interpretation

For TSGs with diagram-based instructions:

```typescript
async function interpretTsgImage(imagePath: string): Promise<StepMetadata> {
  const imageBase64 = await readImageAsBase64(imagePath);
  const response = await copilot.chat({
    messages: [{
      role: "user",
      content: [
        { 
          type: "text", 
          text: "Extract the executable steps from this troubleshooting diagram. Return as JSON with 'command' and 'description' fields." 
        },
        { 
          type: "image_url", 
          image_url: { url: `data:image/png;base64,${imageBase64}` } 
        }
      ]
    }]
  });
  return parseImageInterpretation(response);
}
```

#### 3. Output Summarization

After command execution, summarize large outputs:

```typescript
async function summarizeOutput(
  output: string, 
  incidentContext: IncidentContext
): Promise<string> {
  return await copilot.chat({
    messages: [{
      role: "user",
      content: `Summarize this command output for a DRI investigating a 
                ${incidentContext.severity} incident. Highlight errors, 
                warnings, and anomalies:\n\n${output.slice(0, 8000)}`
    }]
  });
}
```

#### 4. Command Explanation

Pre-execution safety check:

```typescript
async function explainCommand(command: string): Promise<string> {
  return await copilot.chat({
    messages: [{
      role: "user",
      content: `Explain exactly what this command will do, including any 
                potential side effects or risks:\n\n${command}`
    }]
  });
}
```

---

## Safety & Auditability Framework

### Command Classification Matrix

| Type | Example | Dry Run Required | Double Confirm | Audit Level |
|------|---------|------------------|----------------|-------------|
| **Diagnostic** | `az webapp show` | No | No | Info |
| **Remediation** | `az webapp restart` | Yes | No | Warning |
| **Destructive** | `az webapp delete` | Yes | Yes | Critical |
| **Escalation** | `az vm deallocate --force` | Yes | Yes + Approval | Critical |

### Audit Log Schema

```json
{
  "timestamp": "2026-01-29T03:45:12Z",
  "incident_id": "INC-12345",
  "dri_id": "alice@contoso.com",
  "tsg_path": "database/connectivity.md",
  "tsg_hash": "sha256:abc123...",
  "step_anchor": "## Step 3: Restart App Service",
  "command_executed": "az webapp restart --name api-gateway-prod --resource-group prod-east-rg",
  "command_hash": "sha256:def456...",
  "dry_run": false,
  "exit_code": 0,
  "duration_ms": 2340,
  "copilot_assisted": false
}
```

### Safety Controls

1. **Pattern Blocklist** — Block dangerous patterns (e.g., `rm -rf /`) unless explicitly signed
2. **Variable Validation** — Ensure all `${variables}` are populated before execution
3. **Drift Detection** — Flag "Potentially Stale" if TSG hash changed since overlay verification
4. **Sandboxed Terminal** — Inject only whitelisted environment variables

---

## Learning from Execution Paths

### Concept Overview

Every time a TSG is executed in the context of an incident, the execution path (AST) is captured and enriched with metadata. This data feeds a learning pipeline that continuously improves TSG quality and provides predictive guidance.

```
┌─────────────────────────────────────────────────────────────────┐
│  Incident Starts                                                │
│  └── DRI opens TSG via deep link                               │
│       └── Executes Step 1 → Step 3 → Step 7 (skips 2,4,5,6)    │
│            └── Incident Resolved                                │
│                 └── Execution Path AST captured:                │
│                     { steps: [1,3,7], duration: 12min,          │
│                       incident_type: "db_connection",           │
│                       success: true, rollbacks: 0 }             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Aggregate over 100+ incidents
┌─────────────────────────────────────────────────────────────────┐
│  Learned Patterns:                                              │
│  • 78% of DRIs skip Step 2 → Candidate for deprecation         │
│  • Step 3→7 jump correlates with "namespace=prod" context      │
│  • Step 5 has 45% rollback rate → Needs safety review          │
│  • Average path length: 3.2 steps (TSG has 12 steps)           │
└─────────────────────────────────────────────────────────────────┘
```

### Value Proposition

| Insight | Business Value |
|---------|----------------|
| Steps never executed | Identify dead documentation |
| Steps frequently skipped | TSG is over-engineered |
| Steps with high rollback rate | Dangerous/unclear instructions |
| Steps always executed together | Candidates for automation/merging |

### Execution Path AST Schema

```typescript
export interface ExecutionNode {
  step_id: string;                    // Hash of step anchor
  step_anchor: string;                // "## Check Pod Status"
  action_type: "diagnostic" | "remediation" | "escalation";
  
  // Execution metadata
  executed_at: string;                // ISO timestamp
  duration_ms: number;
  exit_code: number | null;
  
  // DRI behavior signals
  was_dry_run_first: boolean;
  was_skipped: boolean;
  was_rolled_back: boolean;
  copilot_assisted: boolean;
  
  // Context at execution time
  incident_context: Record<string, string>;
}

export interface ExecutionPathAST {
  id: string;                         // UUID
  tsg_path: string;
  tsg_hash: string;                   // Detect drift
  
  // Incident context
  incident_id: string;
  incident_severity: "SEV1" | "SEV2" | "SEV3";
  incident_service: string;
  incident_tags: string[];
  
  // The actual path
  nodes: ExecutionNode[];
  
  // Outcome
  resolution_status: "resolved" | "escalated" | "abandoned";
  total_duration_ms: number;
  dri_id: string;                     // Hashed for privacy
  
  // Learning signals
  dri_feedback?: {
    was_helpful: boolean;
    missing_steps?: string;
    confusing_steps?: string[];
  };
}
```

### Learning Pipeline Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  TSG Executor    │────▶│  Event Stream    │────▶│  Learning Store  │
│  (VS Code Ext)   │     │  (EventHub/      │     │  (Cosmos/SQL)    │
│                  │     │   Kafka)         │     │                  │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                              ┌─────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Offline Learning Jobs (Daily/Weekly)                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │ Path Frequency │  │ Step Efficacy  │  │ Context Clustering │ │
│  │ Analysis       │  │ Scoring        │  │ (similar incidents)│ │
│  └────────────────┘  └────────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Outputs                                                          │
│  • Execution overlay enrichment (auto-suggest step ordering)     │
│  • TSG health dashboard (stale, ineffective, dangerous steps)    │
│  • DRI guidance model (predict optimal path for new incidents)   │
│  • Training data for fine-tuned Copilot prompts                  │
└──────────────────────────────────────────────────────────────────┘
```

### Learning Algorithms

#### 1. Markov Chain for Path Prediction

```python
class TSGPathPredictor:
    """
    Build transition probabilities from execution paths.
    P(next_step | current_step, incident_context)
    """
    
    def __init__(self):
        self.transitions = defaultdict(lambda: defaultdict(int))
        self.context_transitions = defaultdict(
            lambda: defaultdict(lambda: defaultdict(int))
        )
    
    def learn(self, path: list[str], context: dict):
        context_key = self._context_key(context)
        for i in range(len(path) - 1):
            current, next_step = path[i], path[i + 1]
            self.transitions[current][next_step] += 1
            self.context_transitions[context_key][current][next_step] += 1
    
    def predict_next(
        self, 
        current_step: str, 
        context: dict
    ) -> list[tuple[str, float]]:
        """Returns ranked list of (next_step, probability)"""
        context_key = self._context_key(context)
        
        global_probs = self._normalize(self.transitions[current_step])
        context_probs = self._normalize(
            self.context_transitions[context_key][current_step]
        )
        
        # 70% weight to context-specific if available
        blended = self._blend(global_probs, context_probs, context_weight=0.7)
        return sorted(blended.items(), key=lambda x: -x[1])
```

#### 2. Step Efficacy Scoring

```sql
-- Calculate resolution rate after each step
WITH step_outcomes AS (
  SELECT 
    tsg_path,
    step_id,
    step_anchor,
    resolution_status,
    CASE WHEN LEAD(step_id) OVER (
           PARTITION BY execution_id ORDER BY executed_at
         ) IS NULL 
         AND resolution_status = 'resolved' 
         THEN 1 ELSE 0 END as was_resolution_step,
    was_rolled_back
  FROM execution_nodes
  JOIN execution_paths ON execution_nodes.execution_id = execution_paths.id
)
SELECT 
  tsg_path,
  step_anchor,
  COUNT(*) as total_executions,
  SUM(was_resolution_step)::float / COUNT(*) as resolution_rate,
  SUM(was_rolled_back::int)::float / COUNT(*) as rollback_rate,
  (SUM(was_resolution_step)::float / COUNT(*)) - 
  (SUM(was_rolled_back::int)::float / COUNT(*) * 0.5) as efficacy_score
FROM step_outcomes
GROUP BY tsg_path, step_id, step_anchor
ORDER BY efficacy_score DESC;
```

### Predictive Guidance UI

Once sufficient execution data is collected, display suggested paths:

```
┌────────────────────────────────────────────────────────┐
│  💡 Suggested Path                                     │
│                                                        │
│  Based on 47 similar incidents (db_connection +        │
│  namespace:prod-east), DRIs typically follow:          │
│                                                        │
│  Step 1 → Step 3 → Step 7                              │
│                                                        │
│  Average resolution time: 8 min                        │
│  [Follow Suggested Path]  [Show All Steps]             │
└────────────────────────────────────────────────────────┘
```

### TSG Optimization Recommendations

```typescript
interface TSGOptimization {
  tsg_path: string;
  recommendations: [
    { 
      type: "deprecate", 
      step: 2, 
      reason: "Executed in only 3% of incidents" 
    },
    { 
      type: "merge", 
      steps: [3, 4], 
      reason: "Always executed sequentially, <2s apart" 
    },
    { 
      type: "promote", 
      step: 7, 
      reason: "Most effective resolution step (89% success after)" 
    },
    { 
      type: "reorder", 
      suggestion: [1, 7, 3], 
      reason: "Optimal path based on 127 incidents" 
    }
  ];
}
```

### Privacy & Security Considerations

| Concern | Mitigation |
|---------|------------|
| DRI identity exposure | Hash or anonymize `dri_id` in learning store |
| Command output may contain secrets | Never store raw output; only exit codes and duration |
| Gaming the system | Weight by incident severity; require resolution confirmation |
| Competitive pressure from metrics | Present as team/TSG insights, not individual performance |

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

| Task | Description | Priority |
|------|-------------|----------|
| URI Protocol Handler | Handle `vscode://` deep links with incident context | P0 |
| TSG Indexer | Fuzzy search by service tags | P0 |
| Webview Renderer | Display TSG with highlighted executable sections | P0 |
| Audit Logging | Infrastructure for command execution logging | P0 |

### Phase 2: Execution Engine (Weeks 5-8)

| Task | Description | Priority |
|------|-------------|----------|
| Overlay Parser | Parse and validate overlay files | P0 |
| Context Hydration | Variable substitution from incident metadata | P0 |
| Sandboxed Executor | Terminal with pattern blocklist | P0 |
| Run/Dry Run UI | Buttons for top 50 TSGs | P1 |

### Phase 3: Intelligence Layer (Weeks 9-12)

| Task | Description | Priority |
|------|-------------|----------|
| Copilot Integration | Command suggestions for un-annotated steps | P1 |
| Output Summarization | Summarize large command outputs | P1 |
| Drift Detection | TSG hash comparison with overlay | P1 |
| Command Explanation | Pre-execution safety explanations | P2 |

### Phase 4: Learning & Vision (Weeks 13-16)

| Task | Description | Priority |
|------|-------------|----------|
| Path Recording | Capture execution paths to event stream | P1 |
| Learning Dashboard | Step frequency and efficacy visualization | P1 |
| Image Interpretation | AI-assisted diagram-to-command extraction | P2 |
| Predictive Guidance | Suggest optimal paths based on history | P2 |

### Phase 5: Scale & Optimize (Weeks 17-20)

| Task | Description | Priority |
|------|-------------|----------|
| Bulk Overlay Generation | Tooling to bootstrap remaining TSGs | P2 |
| Path Prediction Model | Markov chain for next-step suggestions | P2 |
| MTTR Dashboard | Measure impact on resolution times | P1 |
| Copilot Fine-Tuning | Use paths as training data | P3 |

---

## Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| **MTTR (P50)** | 45 min | 32 min (-30%) | Incident system data |
| **TSG discovery time** | 8 min | 30 sec | Extension telemetry |
| **Command execution errors** | 12% | 3% | Audit log analysis |
| **DRI satisfaction** | N/A | >4.2/5 | Quarterly survey |
| **TSG coverage** | 0% | 80% top TSGs | Overlay count |
| **Learning data captured** | N/A | 100% executions | Event stream metrics |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Copilot suggests dangerous command | Medium | High | Blocklist patterns + dry-run enforcement |
| Overlay drift from TSG | High | Medium | Hash validation + "Stale" warnings |
| DRI over-reliance on automation | Medium | Medium | Require manual confirmation for destructive ops |
| Adoption resistance | Medium | High | Gamification (execution badges), leadership buy-in |
| Privacy concerns with path logging | Medium | Medium | Hash DRI IDs; no raw command output storage |
| Learning model cold start | High | Low | Start with frequency analysis; ML is optional |

---

## Competitive Analysis

| Feature | Runbook.io | PagerDuty Runbooks | **TSG Executor** |
|---------|------------|--------------------|--------------------|
| Zero-touch integration | ❌ Requires migration | ❌ Separate system | ✅ Overlay approach |
| IDE-native experience | ❌ | ❌ | ✅ VS Code embedded |
| AI command suggestion | ❌ | Limited | ✅ Copilot SDK |
| Image interpretation | ❌ | ❌ | ✅ Vision API |
| Incident context hydration | Manual | Partial | ✅ Full automation |
| Execution path learning | ❌ | ❌ | ✅ Novel capability |
| Predictive guidance | ❌ | ❌ | ✅ Based on history |

---

## Appendix

### A. Example Deep Link

```
vscode://tsg-executor.open?incidentId=INC-12345&tsgPath=database%2Fconnectivity.md&namespace=prod-east&service=api-gateway&severity=SEV1
```

### B. Example Execution Overlay

See [Execution Overlay Specification](#execution-overlay-specification).

### C. Related Work

- [Executable Talk](../001-core-extension-mvp/spec.md) — VS Code extension for executable presentations
- Google SRE Book — Chapter on Incident Management
- Microsoft Incident Response Framework

### D. Open Questions

1. Should execution overlays live in the same repo as TSGs or a separate "automation" repo?
2. What is the retention policy for execution path data?
3. How do we handle TSGs that span multiple services?
4. Should we integrate with Azure Monitor for automatic context enrichment?

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-29 | [Author] | Initial draft |
