# Phase 2 Volume 6: Sprint Roadmap & Automated Testing Strategy

**Project:** Newspaper Automatic Composition SaaS Platform (Phase 2 — Publisher Experience)  
**Target Audience:** CTO, Agile Product Managers, Lead QA & Automation Engineers  
**Modules Covered:** Sprint-wise Implementation Plan & Enterprise Testing Governance across all 24 Modules

---

## 1. 10-Sprint Phase 2 Agile Implementation Roadmap

To deliver all 24 enterprise publisher modules predictably without disrupting live Phase 1 operations, execution is partitioned into **ten disciplined 2-week sprints**:

```mermaid
gantt
    title Phase 2 Publisher Experience SaaS Roadmap (Sprints 16 - 25)
    dateFormat  YYYY-MM-DD
    section Phase 2: Foundation & Governance
    Sprint 16: DB Schema & Licensing Engine :active, sp16, 2026-08-15, 14d
    Sprint 17: Device Fingerprint & Team RBAC :sp17, after sp16, 14d
    section Phase 2: Studio & Prepress
    Sprint 18: Sub-Editions & Template Manager :sp18, after sp17, 14d
    Sprint 19: R2 Cloud Asset & Ad Library :sp19, after sp18, 14d
    Sprint 20: Prepress CMYK Print Settings   :sp20, after sp19, 14d
    section Phase 2: Real-Time Execution
    Sprint 21: WebSocket & Queue Live Status  :sp21, after sp20, 14d
    Sprint 22: PDF Versioning & Canvas Viewer :sp22, after sp21, 14d
    section Phase 2: Intelligence & Scale
    Sprint 23: BI Analytics, Search & Tickets :sp23, after sp22, 14d
    Sprint 24: White-Label & Hybrid Pricing   :sp24, after sp23, 14d
    Sprint 25: E2E Load Test & Prod Go-Live     :sp25, after sp24, 14d
```

### Detailed Sprint Milestones:
* **Sprint 16 (Additive DB Schema & License Quotas):** Apply `00002_phase2_publisher_platform.sql` migration in Docker; implement cryptographic License Key verification services in Go Fiber; integrate monthly quota checking against Phase 1 wallet deductors.
* **Sprint 17 (Device Tracking, Session Revocation & Team RBAC):** Develop browser fingerprinting hash generators; implement hardware limits in Go auth middleware; assemble team invitation and granular 8-role RBAC authorization tables.
* **Sprint 18 (Multi-Edition Management & Studio Template Creator):** Scaffolding Next.js Studio layouts; implement sub-edition Ank inheritance logic (`inherit_parent_ank`); create JSONB prepress template storage APIs.
* **Sprint 19 (Cloudflare R2 Asset Repository & Advertisement CRM):** Build drag-and-drop simulated file upload zones in Next.js; engineer dynamic SVG/EPS QR code generator utilities; configure advertisement expiration warning alarms.
* **Sprint 20 (Professional CMYK Offset Print Settings Engine):** Implement Fogra39/JapanColor CMYK color profile enforcement rules; build 3.0mm exterior bleed and registration crop-mark parameter injection for the external generator engine.
* **Sprint 21 (Real-Time WebSocket Gateway & Asynq Queue Monitor):** Mount `@gofiber/websocket/v2` endpoints; configure Redis Pub/Sub status topic broadcast from Asynq rendering workers; construct reactive Next.js live progress bars.
* **Sprint 22 (Parent-Child PDF Versioning & In-Browser Canvas Previewer):** Build zero-overwriting PDF draft sequencing (`v1`, `v2`, `v3`); integrate PDF.js canvas web workers in Next.js for 800% micro-typography inspection.
* **Sprint 23 (Universal GIN Search Engine, BI Analytics & Support Center):** Set up PostgreSQL trigram search indexes; build Recharts revenue and storage usage visualizations; deploy interactive support ticket submission modals.
* **Sprint 24 (Multi-Tenant White-Label Routing & Hybrid Pricing Engine):** Build custom `Host` header edge parsing in Nginx and Go Fiber; implement auto-renewal overdraft prompts combining license subscriptions and Razorpay wallets.
* **Sprint 25 (Comprehensive End-to-End Regression & Production Go-Live):** Execute automated WebSocket load tests and backward compatibility QA suites; finalize deployment sign-off checklist.

---

## 2. Enterprise Testing Strategy & Quality Assurance Architecture

To maintain reliability when supporting over 1,000,000 publishers, testing protocols operate across three exhaustive vectors:

### 2.1 Backward Compatibility & Regression Suite (Go Test Engine)
* **Zero-Breaking Validation:** Automated unit test asserting that legacy calls to Phase 1 `/api/v1/newspapers/generate` (lacking Phase 2 sub-edition or print setting headers) still execute normally, defaulting gracefully to standard broadsheet dimensions without generating 500 server errors.
* **License vs. Wallet Boundary Testing:** Automated test checking that when a Basic License reaches issue #30, issue #31 correctly intercepts execution with an interactive overdraft wallet fee prompt rather than hard-locking publishing operations.

### 2.2 WebSocket Concurrency & Pub/Sub Isolation Test (Go / K6 Simulation)
* **Multi-Tenant Broadcast Shield Test:** Spin up 200 simulated WebSocket clients connected to distinct generation job hashes. Assert that status events published by Worker A over Redis Pub/Sub (`ws:pubsub:gen_job:A`) never leak across socket connections subscribed to Worker B (`ws:pubsub:gen_job:B`).

### 2.3 Automated UI & Canvas Previewer Assertions (Playwright E2E)
* Automated Playwright UI scripts that log in as a Designer, drag and drop test mastheads into the Cloud Asset Library, switch print color space from RGB to Fogra39 CMYK, initiate a live WebSocket generation render, and verify that the resulting PDF.js preview canvas renders crop marks with zero Console JavaScript errors.
