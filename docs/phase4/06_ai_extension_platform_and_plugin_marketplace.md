# Phase 4 Volume 6: Decoupled AI Extension Platform & Plugin Marketplace

**Project:** Newspaper Automatic Composition Enterprise Publishing Ecosystem (Phase 4)  
**Target Audience:** AI ML Engineers, Third-Party Plugin Developers, Newsroom Editorial Heads  
**Modules Covered:** Module 23 (AI Extension Platform), Module 24 (Plugin Marketplace)  
**Deliverables Answered:** #5 (Plugin SDK Design), #16 (Codebase Folder Structure)

---

## 1. Decoupled AI Extension Platform Interfaces (Module 23 & Deliverable #5)

**Strict Mandate:** Do NOT connect costly external LLM APIs (like OpenAI or Anthropic) directly into core publishing workflows now. Build **clean, decoupled interface contracts** that allow future AI providers to plug into the ecosystem without altering runtime routing code.

### 1.1 Comprehensive AI Interface Contracts (`pkg/plugins/sdk.go`)
We expand our Phase 3 AI extension stubs into an enterprise AI architecture supporting **7 core media capabilities**:

```go
package plugins

import "context"

// Enterprise AI Capability Extension Interface (Module 23)
type AIExtensionProvider interface {
	SuggestHeadlines(ctx context.Context, articleBody string, targetLang string) ([]string, error)
	ExtractOCRText(ctx context.Context, imageURL string, language string) (string, error)
	TranslateContent(ctx context.Context, sourceText string, sourceLang string, targetLang string) (string, error)
	SummarizeArticle(ctx context.Context, articleBody string, maxWords int) (string, error)
	PerformFactCheck(ctx context.Context, articleBody string) (FactCheckAuditReport, error)
	GenerateImageTags(ctx context.Context, r2PhotoURL string) ([]string, error)
	ConvertSpeechToText(ctx context.Context, audioURL string) (string, error) // For reporter dictation
}
```

* **Headline & Devanagari OCR Suggestion Hooks:** When reporters submit long drafts, the interface can be invoked to suggest high-click-through broadsheet headlines or extract Hindi Devanagari OCR characters from uploaded photo scans.
* **Speech-to-Text Reporter Dictation:** Enables correspondents to record voice notes in the field, utilizing future whisper/speech-to-text models to automatically convert dictations into formatted article paragraphs inside Module 5!

---

## 2. Third-Party Plugin Marketplace SDK & Sandboxing (Module 24 & Deliverable #5)

To emulate the extensibility of Canva Pro, Notion, and WordPress, we design a third-party **Plugin Marketplace Architecture** (`plugin_manifests` & `installed_tenant_plugins`).

### 2.1 Plugin Manifest & Sandbox Enforcement
External developers build plugins using our downloadable **Plugin Marketplace SDK**, packaging their extensions with a standard JSON schema manifest (`manifest.json`):

```json
{
  "plugin_id": "com.syndicate.ai.devanagari-ocr-pro",
  "name": "Devanagari OCR & Grammar Assistant",
  "version": "1.4.0",
  "author": "National Media Labs",
  "description": "Real-time Hindi & Marathi grammatical spellcheck and OCR extraction for newsroom editors.",
  "permissions_requested": [
    "editorial:read",
    "dam_photos:read",
    "ai_extension:execute"
  ],
  "sandbox_entrypoint": "https://plugins.media-labs.com/webhook/ocr-execute",
  "min_gateway_version": "v3.0.0"
}
```

### 2.2 Strict Zero-Trust Sandboxing & RBAC Permissions
* **Granular Permission Boundaries:** Plugins cannot gain blanket root access. When a tenant admin installs a plugin from the Marketplace console, they must review and authorize explicit scopes (e.g., `editorial:read` is allowed, but `finance_invoices:write` is rejected).
* **Network & Memory Sandboxing:** Third-party plugin execution occurs inside secure network isolated contexts via HTTP webhooks or WebAssembly (Wasm) runtime hooks, guaranteeing that a buggy third-party plugin cannot crash the main Go Fiber application gateway or leak database memory pools!

---

## 3. Production Codebase Folder Structure (Deliverable #16)

Our unified modular monorepo cleanly scales across all 4 development phases:

```
newspaper front/
├── backend/
│   ├── cmd/api/main.go               # Unified Entrypoint (Phases 1, 2, 3 & 4 Gateway routes)
│   ├── internal/
│   │   ├── middleware/
│   │   │   ├── white_label.go        # Phase 2 White-Label Host Resolver
│   │   │   └── api_gateway.go        # [NEW - Phase 4] OAuth2, Rate Limiter & Usage Meter
│   │   ├── services/
│   │   │   ├── websocket_service.go  # Phase 2 Real-Time Pub/Sub
│   │   │   ├── ad_planner_service.go # Phase 3 Grid Collision Engine
│   │   │   ├── webhook_service.go    # [NEW - Phase 4] Outgoing Webhook & DLQ Replay Engine
│   │   │   └── event_bus_service.go  # [NEW - Phase 4] Domain Event Store & Streamer
│   ├── pkg/
│   │   └── plugins/
│   │       └── sdk.go                # [NEW - Phase 4] Plugin Marketplace SDK & AI Extension Hooks
│   └── migrations/
│       ├── 00001_initial_schema.sql  # Phase 1 Core Database
│       ├── 00002_phase2_publisher.sql# Phase 2 Publisher Platform Additions
│       ├── 00003_phase3_erp.sql      # Phase 3 Newspaper ERP Additions
│       └── 00004_phase4_ecosystem.sql# [NEW - Phase 4] 20+ Ecosystem & Gateway Tables
│
├── frontend/
│   └── src/app/
│       ├── layout.tsx                # Unified App Layout & Multi-Portal Navigation
│       ├── (dashboard)/
│       │   ├── studio/page.tsx       # Phase 2 Studio Console
│       │   ├── editorial/page.tsx    # Phase 3 Editorial Newsroom CMS
│       │   ├── planner/page.tsx      # Phase 3 Visual Ad Planner Grid
│       │   ├── production/page.tsx   # Phase 3 Press MIS & Circulation
│       │   ├── developer/page.tsx    # [NEW - Phase 4] Developer Portal, API Keys & Sandbox
│       │   ├── advertiser/page.tsx   # [NEW - Phase 4] Advertiser Self-Service Portal
│       │   ├── vendor-portal/page.tsx# [NEW - Phase 4] Printing Press & Supplier Vendor Portal
│       │   └── crm-bi/page.tsx       # [NEW - Phase 4] Enterprise CRM Pipeline & BI 2.0 Deck
│       └── (public)/
│           └── epaper/page.tsx       # Phase 3/4 Public ePaper Reader Web Portal
```
