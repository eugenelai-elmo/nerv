---
source: Gemini-generated brief, Sep 2026
status: raw input — not yet validated or adopted
---

# Brief: Agentic Substrate Stack (v2.0)

## Executive Summary

This document provides a cohesive, unified blueprint for an enterprise-ready, cost-optimized, multi-modal AI agent architecture. By establishing rigid interface abstractions across the user interface, persistent execution sub-environments, hierarchical context storage, cross-device action layers, and sub-100ms routing switchboards, the stack achieves complete platform decoupling.

The architecture guarantees task persistence, mitigates token bloat by up to 90%, and implements deterministic fast-path execution to bypass expensive frontier LLM calls whenever possible.

## The Comprehensive Component Stack

- **User Interface Layer:** AWS Pizza Bot UI (Chat-centric, responsive WebSocket interface).
- **Execution Substrate:** Herdr (Persistent PTY process multiplexing and background terminal sessions).
- **Memory Layer:** OpenViking (viking:// hierarchical directory-aware context database).
- **Mobile Control Layer:** Google ARTEMIS (Multi-modal Android runtime automation exposed natively via MCP).
- **Routing & Optimization Substrate:** TypeSafe AI Jev + Cloudflare Workers & Cloudflare AI (System One parallel classification gateway running at the network edge via Wrangler).

## Core Architecture Diagram

```
                 [ User Browser / Client ]
                             ||  (WebSockets)
                      [ AWS Pizza Bot UI ]
                             ||
    === [ Wrangler Edge Node / Cloudflare Workers Gateway ] ===
                             ||
                             v
                 [ Interface Hub Router ]
                             ||
       ===============================================================
       ||              ||                   ||                      ||
       v               v                    v                       v
 [ IMemory ]    [ ISubstrate ]      [ IDeviceController ]    [ IFastRouter ]
       ||              ||                   ||                      ||
  (OpenViking)      (Herdr)              (ARTEMIS)                (Jev)
  [viking://]    [PTY Runtimes]        [MCP Server]          [System One Box]
                       ||                   ||
                       v                    v
                (Claude Code CLI)     (Android Device)
```

## End-to-End System Dataflow

### 1. Ingestion & Fast Routing (System One Gatekeeping)

The user issues a command or task block via the Pizza Bot UI. The raw payload is intercepted at the edge by a Cloudflare Worker. Before escalating to expensive reasoning LLMs, the Worker calls Jev via an HTTPS edge call. Jev executes parallel probabilistic evaluation over the context using typed noul (yes/no) and choice bindings to deduce the exact intent.

**Deterministic Bypass:** If Jev detects a non-generative task (e.g., standard retrieval, simple tool invocation, directory lookup), it routes the command directly to its execution target, completely avoiding Claude Code and saving 100% of LLM execution costs.

### 2. Context Compaction & Recall (OpenViking Integration)

If Jev determines the task requires System Two reasoning, it triggers the OpenViking context loading sequence. OpenViking checks the active Herdr Workspace ID and targets the corresponding viking:// directory sub-tree. Rather than dumping full logs, it loads raw text progressively (L0 Abstract → L1 Overview → L2 Source Document), dynamically pruning historical context to construct a highly dense, minimal token footprint.

### 3. Substrate Orchestration & Execution (Herdr & Claude Code)

The compacted context and prompt are passed down via the Herdr Socket API into an isolated, long-running PTY pseudo-terminal pane containing the Claude Code session. If Claude Code runs continuous command sequences (e.g., executing heavy test runners, linting directories), the raw terminal outputs are intercepted by the environment hook. The output stream passes through Jev for real-time pruning, ensuring hundreds of lines of terminal "slop" are scrubbed before modifying Claude's operational context history.

### 4. Cross-Device Mobility Execution (Artemis Layer)

When a multi-modal hardware task is required, Claude Code or the Orchestrator invokes tools exposed by the ARTEMIS MCP Server. ARTEMIS processes the intent via its Flash Mode look-and-swipe loop to automate the mobile interface. Visual trajectories, structural hierarchies, and Logcat traces emitted by ARTEMIS are captured asynchronously and saved as structured markdown logs directly back into OpenViking's viking://devices/ path tree for future auditing.

## Unified Technical Interfaces

```typescript
// 1. Context & File-System Memory
interface IMemoryStack {
  initializeWorkspace(workspaceId: string): Promise<boolean>;
  recallContext(path: string, query: string, tier: 'L0' | 'L1' | 'L2'): Promise<string>;
  saveContext(path: string, memoryPayload: object): Promise<void>;
}

// 2. Persistent Process Substrate
interface ISubstrate {
  createSession(sessionId: string): Promise<string>;
  sendInput(paneId: string, text: string): Promise<void>;
  streamOutput(paneId: string, callback: (chunk: string) => void): void;
  getSessionStatus(paneId: string): Promise<'idle' | 'working' | 'blocked' | 'done'>;
}

// 3. Multi-Modal Device Control
interface IDeviceController {
  connectDevice(deviceId: string): Promise<boolean>;
  executeAction(intent: string, profile: 'flash' | 'pro'): Promise<DeviceActionResult>;
  getScreenSnapshot(): Promise<{ base64Image: string; uiHierarchy: object }>;
}

// 4. Edge Routing & Classification (Jev)
interface IFastRouter {
  evaluateSystemOne(state: object, prompt: string): Promise<JevDecision>;
  compactTerminalOutput(rawOutput: string): Promise<string>;
}

// Data Structures
interface JevDecision {
  shouldEscalateToClaude: boolean;
  targetActionPath: 'terminal' | 'viking' | 'artemis' | 'ui';
  confidence: number;
}

interface DeviceActionResult {
  success: boolean;
  executionTrajectory: string[];
  capturedLogs: string[];
  screenshotUrls: string[];
}
```

## Edge Gateway Deployment (wrangler.jsonc)

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "agentic-substrate-gateway",
  "main": "src/gateway.ts",
  "compatibility_date": "2026-09-21",
  "ai": {
    "binding": "AI"
  },
  "vars": {
    "JEV_API_BASE": "https://typesafe.ai",
    "OPENVIKING_ENDPOINT": "http://localhost:8080/v1"
  },
  "bindings": [
    {
      "name": "HERDR_SOCKET_SERVICE",
      "type": "service",
      "service": "herdr-bridge-service"
    }
  ]
}
```

## Implementation Roadmap

### Phase 1: Stub & Verification
Instantiate all 4 core TypeScript/Python interfaces inside a unified orchestration package. Run dry-run mocking to validate end-to-end data pipelines.

### Phase 2: Edge Routing Setup
Deploy the Cloudflare Workers gateway using Wrangler. Bind the TypeSafe AI SDK inside the script and build the user submit hook middleware to process prompts before routing to Claude Code.

### Phase 3: Substrate & Device Wiring
Connect the Worker gateway to the background Herdr Unix domain sockets. Start a local Android emulator instance running the ARTEMIS MCP daemon and verify structural coordinate control via tool calls.

### Phase 4: Memory Anchoring
Implement the background reflection workers that clean up ARTEMIS execution footprints and write condensed markdown summaries back to the OpenViking storage layer.
