# Phase 3 Volume 1: ERP System Architecture, Multi-Company Syndicates & Module Dependencies

**Project:** Newspaper Automatic Composition Enterprise ERP Platform (Phase 3)  
**Target Audience:** Chief Technology Officers, ERP Architects, Enterprise Media Group Directors  
**Modules Covered:** Module 1 (Newsroom Organization), Module 24 (Multi-Company Support), Module 25 (Enterprise API), Module 29 (System Settings), Module 30 (Future AI Ready)  
**Deliverables Answered:** #1 (ERP System Architecture), #6 (Module Dependency Diagram), #18 (Security & RBAC Updates), #20 (Monitoring & Logging)

---

## 1. Enterprise ERP Architectural Synthesis & Zero-Breaking Mandate
Phase 3 upgrades our publishing portal into a high-throughput **Newspaper Enterprise Resource Planning (ERP) Suite**. The core architectural invariant remains absolute: **Zero Breaking Changes to Phase 1 & Phase 2 structures**. All existing Go Fiber authentication pipelines, Razorpay wallet deduction ledgers, Asynq generation workers, and Cloudflare R2 presigned storage buckets are natively ingested into the wider ERP operational matrix.

---

## 2. Multi-Company Holding Syndicate Architecture (Module 24)

Large-scale national media syndicates govern hundreds of publishing imprints (e.g., *Times Group* owning *Economic Times*, *Mumbai Times*, and 50 regional district papers). To accommodate holding structures without altering Phase 1 `organizations` tables, we implement an **Associative Holding Matrix**:

```mermaid
graph TD
    subgraph Conglomerate Level [Parent Holding Company Tier]
        HC[Holding Company HQ: National Publishing Syndicate Ltd]
        FIN_POOL[Shared Corporate Treasury & Statutory GST Vault]
        DAM_CENTRAL[Central Cloudflare R2 Master Photo Archive]
    end

    subgraph Subsidiary Enterprises [Phase 1/2 Isolated Organizations]
        ORG1[Org 01: Daily State Times - Hindi]
        ORG2[Org 02: Pune District Express - Marathi]
        ORG3[Org 03: Mumbai Commercial Financial Mirror - English]
    end

    subgraph Autonomous Production Operations [Independent Publication Shields]
        ANK1[Ank Sequence #126] & WALLET1[Local Operational Wallet] & EDIT1[Morning / City Editions]
        ANK2[Ank Sequence #412] & WALLET2[Local Operational Wallet] & EDIT2[District Special Editions]
        ANK3[Ank Sequence #89]  & WALLET3[Local Operational Wallet] & EDIT3[Weekend Business Magazine]
    end

    HC -->|holding_subsidiaries Association| ORG1 & ORG2 & ORG3
    HC --> FIN_POOL
    HC --> DAM_CENTRAL

    ORG1 --> ANK1 & WALLET1 & EDIT1
    ORG2 --> ANK2 & WALLET2 & EDIT2
    ORG3 --> ANK3 & WALLET3 & EDIT3
    
    DAM_CENTRAL -->|Zero-Egress Read ACL| ORG1 & ORG2 & ORG3
```

* **Shared vs. Isolated Entities:**
  - **Shared Resources:** Corporate finance ledger overviews, employee HR document repositories, global advertising rate cards, and centralized DAM photo collections.
  - **Strictly Isolated Entities:** Individual newspaper issue Ank numbers, local Razorpay operational top-up wallets, physical printing machine shift logs, and localized sub-editions.

---

## 3. Newsroom Organization & Unlimited Hierarchy (Module 1)

To model intricate journalistic hierarchies across international bureaus, we establish a recursive tree topology within the `newsroom_org_units` and `employee_hierarchies` database tables:
* **Unlimited Recursive Levels:** Organization $\to$ Head Office $\to$ Regional Directorate $\to$ District Bureau $\to$ City Desk $\to$ Chief Editor $\to$ News Editor $\to$ Sub Editor $\to$ Senior Reporter $\to$ Staff Correspondent $\to$ Freelance Contributor $\to$ Field Photographer.
* **Materialized Path Indexing (L tree equivalents):** To execute instant organizational chart tree visualizers without deep N+1 SQL joins, each unit retains a dot-delimited path index (e.g., `/org_hq00/region_west/bureau_pune/desk_crime`).

---

## 4. Comprehensive ERP Module Dependency Diagram (Deliverable #6)

This diagram clarifies the downstream data flow and operational dependencies running across all 30 Phase 3 modules:

```mermaid
graph TD
    M1[1. Newsroom Org & Hierarchy] --> M2[2. Reporter Management] & M17[17. HR Management]
    M3[3. Beat Management] --> M4[4. Assignment Management]
    M2 --> M4
    M4 --> M5[5. Article Repository] & M7[7. DAM Photo Repo]
    M5 & M7 --> M6[6. Multi-Level Editorial Workflow]
    M6 --> M10[10. Visual Page Planner]
    
    M8[8. Advertisement Booking] --> M9[9. Visual Ad Planner & Collision Engine]
    M9 --> M10
    M8 --> M15[15. GST Invoice Management]
    M10 --> M11[11. Printing Press MIS & Consumables] & M19[19. Public ePaper Reader Portal]
    
    M11 --> M12[12. Print Orders & Production Logs]
    M12 --> M13[13. Circulation & Vendor Distribution ERP]
    M13 & M14[14. Customer Subscriptions] --> M15
    M15 --> M16[16. Finance MIS Dashboard]
    
    M16 & M12 & M13 --> M21[21. BI Executive Analytics & Heat Maps]
    M28[28. Event-Driven Automation Daemon] -.->|Listen to State Transitions| M4 & M6 & M11 & M13
    M30[30. Future AI Extension Hooks] -.->|Interface Injection| M5 & M7
```

---

## 5. Enterprise API, Webhooks & System Settings (Modules 25 & 29)

### 5.1 REST APIs, Webhook Subscription Registry & Rate Limiting (Module 25)
* **Webhook Subscription Vault:** Publishers can register HTTP endpoint callbacks in `api_webhook_targets`. When ERP state changes occur (e.g., `event.print_order_completed` or `event.ad_invoice_paid`), background Asynq workers sign the JSON payload with HMAC-SHA256 and deliver retry-backed webhook notifications to external enterprise CRM or payroll software.
* **Dedicated API Key Management:** Generates revocable access tokens (`np_live_xxxx...`) equipped with granular permission scopes and Redis sliding-window token bucket limits (`100 req/min per key`).

### 5.2 Master System Settings & Statutory Defaults (Module 29)
The central configuration dashboard manages corporate ERP parameters:
* **Statutory Tax Rules:** Default Indian GST tax tiers (e.g., 5% print media advertising, 18% digital commercial services) and TDS withholding deduction coefficients.
* **Operational Defaults:** Standard prepress paper trim margins, warehouse paper reel basis weights (GSM), ink consumption forecasting coefficients, and working hour schedules.

---

## 6. Future AI Ready Architecture & Extension Hooks (Module 30)

To guarantee our codebase remains future-proof without risking immediate runtime instability or unnecessary LLM API cost consumption, we implement **Decoupled Strategic Interface Extensions** within `/backend/pkg/ai/extension_hooks.go`:

```go
package ai
// Clean interfaces allowing seamless future LLM injection without rewriting core Go Fiber controllers

type EditorialAIExtension interface {
    SuggestHeadlines(bodyText string, language string) ([]string, error)
    TranslateArticle(content string, targetLang string) (string, error)
    VerifyFactCheck(claims []string) ([]FactCheckResult, error)
}

type DAMPhotoAIExtension interface {
    GenerateExifTags(r2ImageURL string) ([]string, error)
    PerformOCRTextExtraction(r2ImageURL string) (string, error)
}
```
Currently, active dependency injection wires lightweight pass-through dummy providers into these interfaces. When custom Devanagari OCR or LLM translation models are deployed in future iterations, zero edits to our database or API layer will be required.
