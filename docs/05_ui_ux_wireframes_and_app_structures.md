# Volume 5: UI/UX Wireframes, Responsive Architecture, Project Topographies & 15-Sprint Roadmap

**Project:** Newspaper Automatic Composition SaaS Platform  
**Target Audience:** Lead UI/UX Designers, Full-Stack Engineers, Agile Product Managers, CTO  
**Deliverables Covered:** 19. Admin Panel Wireframes, 20. User Dashboard Wireframes, 21. Mobile Responsive Layouts, 22. API Folder Structure, 23. Backend Folder Structure, 24. Frontend Folder Structure, 35. Development Roadmap (Sprint 1 to 15)

---

## 1. UI/UX Design System & Interface Wireframes (Deliverables #19, #20)

### 1.1 UI Design Philosophy & Aesthetics
To evoke a commercial feeling akin to Adobe Creative Cloud or Canva Pro, our user interface leverages:
* **Design Language:** Tailwind CSS paired with ShadCN UI modular component foundations.
* **Color Themes:** Sleek Dual-Mode Dark/Light themes. Dark Mode defaults to deep gunmetal hues (`#0B0F19` surface with `#1E2640` elevated cards) contrasted against high-visibility brand primary accents (Vibrant Indigo `#4F46E5` and Emerald `#10B981` for financial ledger positive indicators).
* **Micro-Animations:** Powered by Framer Motion to deliver seamless modal open transitions, interactive wallet balance number ticking, and satisfying "Generate Newspaper" processing feedback wheels.

### 1.2 User Publishing Portal Dashboard (Wireframe Architecture)
When an authorized newspaper publisher logs into the portal, they are greeted by an executive action console tailored for speed during tight editorial publishing deadlines:

```
+---------------------------------------------------------------------------------------------------------+
| [LOGO] Newspaper Portal | Edition: Daily Times (Hindi) | RNI: REG-28491 | [☀️/🌙] | [User Profile ▾]  |
+---------------------------------------------------------------------------------------------------------+
|  NAVIGATION: [ 📊 Dashboard ]  [ 📰 Newspaper Settings ]  [ 📂 PDF History ]  [ 💳 Wallet & Recharge ]  |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  +---------------------------+  +---------------------------+  +-------------------------------------+  |
|  | 💰 AVAILABLE WALLET       |  | 🗞️ NEXT ISSUE NUMBER     |  | 📅 TODAY'S PUBLICATION SCHEDULE      |  |
|  | ₹ 4,850.00                |  | Ank # 126                 |  | Daily Edition | Wednesday, Aug 03   |  |
|  | [ + Recharge via Razorpay]|  | Prefix: Vol. / Ank        |  | Cost per issue: ₹ 100.00            |  |
|  +---------------------------+  +---------------------------+  +-------------------------------------+  |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | 🚀 QUICK PUBLISHING ACTION CONSOLE                                                                 |  |
|  | +-----------------------------------------------------------------------------------------------+ |  |
|  | | Ready to generate today's publication? Your uploaded mastheads, stamps & theme are verified.   | |  |
|  | |                                                                                               | |  |
|  | | [ ⚡ GENERATE TODAY'S NEWSPAPER (Ank #126) ]  (Requires ₹100 from Wallet - Processing Time: ~30s)| |  |
|  | +-----------------------------------------------------------------------------------------------+ |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | 🕒 RECENT PUBLICATION HISTORY (Cloudflare R2 Print Archive)                   [ View Full Library ]|  |
|  | ------------------------------------------------------------------------------------------------- |  |
|  | Date         | Issue (Ank) | Pages | Size    | Status    | Downloads | Quick Actions              |  |
|  | ------------------------------------------------------------------------------------------------- |  |
|  | 2026-08-02   | Ank 125     | 12 Pgs| 24.8 MB | 🟢 READY  | 14 times  | [👁️ Preview] [⬇️ Download]  |  |
|  | 2026-08-01   | Ank 124     | 12 Pgs| 23.1 MB | 🟢 READY  | 28 times  | [👁️ Preview] [⬇️ Download]  |  |
|  | 2026-07-31   | Ank 123     | 16 Pgs| 32.4 MB | 🟢 READY  | 19 times  | [👁️ Preview] [⬇️ Download]  |  |
|  +---------------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

### 1.3 Super Admin Enterprise Management Panel (Wireframe Architecture)
The administrative control surface aggregates real-time business health telemetry, tenant provisioning queues, and ledger audits:

```
+---------------------------------------------------------------------------------------------------------+
| 🛡️ ENTERPRISE ADMIN CONSOLE | Super Admin Access | Live Status: 🟢 All Workers Active | [ Logout ]       |
+---------------------------------------------------------------------------------------------------------+
| [ Dashboard ]  [ 👥 Publishers ]  [ 📥 Lead Inflow ]  [ 💳 Ledgers ]  [ 📦 R2 Storage ]  [ ⚙️ Settings ]|
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  +----------------------+ +----------------------+ +----------------------+ +-------------------------+ |
|  | 💵 TODAY'S REVENUE    | | 👥 ACTIVE PUBLISHERS | | 📰 TODAY'S GENERATED | | 💽 R2 CLOUD STORAGE USE | |
|  | ₹ 42,800.00 (+14%)   | | 1,420 Tenants        | | 1,284 PDFs           | | 42.8 TB / Unlimited   | |
|  +----------------------+ +----------------------+ +----------------------+ +-------------------------+ |
|                                                                                                         |
|  +-------------------------------------------------------------+ +------------------------------------+ |
|  | 📈 30-DAY REVENUE & GENERATION GROWTH CHART (Recharts)       | | 🚨 ACTION REQUIRED (Lead Inflow)  | |
|  | [   _.-'""'-._                                              | | - 3 New Subscription Proposals     | |
|  | [.-'          '-._.-''-._                                    | | - 1 Failed Webhook Retry           | |
|  | [                         '-._.-''-._                       | | - 2 Wallets Below Minimum Threshold| |
|  +-------------------------------------------------------------+ +------------------------------------+ |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | ⚡ QUICK TENANT MANAGEMENT (Search by Name, RNI Number, or Mobile)        [ + Create New Publisher ]|  |
|  | ------------------------------------------------------------------------------------------------- |  |
|  | Org Name         | RNI Reg ID | Owner Contact | Wallet Bal | Last Ank  | Status    | Admin Action |  |
|  | ------------------------------------------------------------------------------------------------- |  |
|  | Dainik Bhaskar   | REG-99182  | 9812938491    | ₹ 12,450   | Ank 4192  | 🟢 ACTIVE | [ Manage ▾ ] |  |
|  | Weekly Prabha    | REG-33410  | 9481923841    | ₹ 4,200    | Ank 381   | 🟢 ACTIVE | [ Manage ▾ ] |  |
|  | Express Times    | REG-81273  | 9182739182    | ₹ 50       | Ank 918   | 🟡 LOW BAL| [ Manage ▾ ] |  |
|  +---------------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Mobile Responsive Architectural Strategy (Deliverable #21)

Because newspaper printing press operators often verify production proofs directly from smartphones and industrial tablets while standing next to CMYK web offset printing machines, the portal guarantees 100% fluid responsiveness across three essential breakpoints:

### 2.1 Responsive Layout Behaviours by Device
1. **Desktop (`min-width: 1024px`):** Full widescreen real estate utilizing horizontal persistent navigation headers, side-by-side analytics cards, and standard data tables.
2. **Tablet (`640px` to `1023px`):** Side panels collapse into intuitive top slide-in drawer menus. Analytical charts switch to vertically stacked orientation to maintain typography readability without horizontal scrolling.
3. **Mobile & Pocket Devices (`max-width: 639px`):**
   * **Table Transformation into Card Views:** Standard tables (such as PDF generation history and wallet ledger transactions) automatically transmute into high-contrast interactive cards on mobile screens to prevent microscopic text or awkward sideways swiping.
   * **Touch Target Optimization:** All operational interaction buttons ("Download PDF", "Recharge ₹2000") enforce a strict **minimum finger touch target dimensions of 48x48px** in compliance with WCAG 2.1 AA accessibility mandates.

---

## 3. Comprehensive Folder Architecture Specifications (Deliverables #22, #23, #24)

### 3.1 Go Fiber Backend Application Topography
The backend adopts domain-driven design, enforcing clean architecture boundaries between HTTP transport controllers, business service layers, and database repository interfaces.

```
backend/
├── cmd/
│   └── api/
│       └── main.go                 # Enterprise application bootstrap & graceful shutdown handler
├── internal/
│   ├── config/
│   │   ├── config.go               # Viper environment loader (.env & system variables)
│   │   └── database.go             # PostgreSQL SQLX connection pool & Redis initialization
│   ├── controllers/                # HTTP Transport Handlers (REST / JSON Parsing)
│   │   ├── auth_controller.go      # Login, Refresh token rotation, and session management
│   │   ├── newspaper_controller.go # Settings mutations & background generation dispatch
│   │   ├── payment_controller.go   # Razorpay checkout initiators & cryptographic webhook handler
│   │   └── admin_controller.go     # Tenant onboarding, status controls, and analytical KPIs
│   ├── middleware/
│   │   ├── jwt_auth.go             # Zero-trust Bearer verification & HTTPOnly refresh parsing
│   │   ├── rbac_guard.go           # Granular Role-Based Access checking against roles enum
│   │   ├── rate_limiter.go         # Redis sliding-window IP and tenant throttle defense
│   │   └── helmet_security.go      # CSP, HSTS, X-Frame-Options HTTP response header injection
│   ├── models/                     # GORM / SQLX Data Structures & Validation Tags
│   │   ├── tenant.go               # Organization, Newspaper, and Profile entity structs
│   │   ├── wallet.go               # Double-entry ledger transactional structs
│   │   └── publication.go          # Issue Ank counter and R2 generation history logs
│   ├── repository/                 # Raw PostgreSQL Transactional Queries (Zero SQL Injection)
│   │   ├── pg_user_repo.go         # CRUD & locking user authorization queries
│   │   ├── pg_wallet_repo.go       # ACID serializable debit/credit transaction logic
│   │   └── pg_history_repo.go      # Issue Ank locking and paginated history searches
│   ├── services/                   # Business Domain Logic & Validation Orchestration
│   │   ├── ank_calculator.go       # Concurrency-proof issue increment calculation algorithm
│   │   ├── pdf_orchestration.go    # Asynq payload compilation and external engine bindings
│   │   └── invoice_generator.go    # GST financial invoice computation & R2 asset persistence
│   └── workers/                    # Distributed Background Async Processing Daemons
│       ├── asynq_server.go         # Redis worker daemon lifecycle and concurrency limits
│       └── generator_worker.go     # External Generator HTTP client & exponential fallback logic
├── pkg/                            # Shared Helper Packages & Third-Party Adapters
│   ├── crypt/                      # bcrypt hashing & HMAC SHA-256 validation routines
│   ├── r2cloud/                    # AWS SDK V2 Cloudflare R2 presigned URL signer
│   └── smtp/                       # Resend email API client for transactional notifications
├── migrations/                     # SQL Goose Reversible Migration Scripts (3NF Schema)
├── Dockerfile                      # Multi-stage optimized compilation build script
├── go.mod
└── go.sum
```

### 3.2 Next.js 15 App Router Frontend Topography
```
frontend/
├── src/
│   ├── app/                        # Next.js 15 App Router Layouts & Server Page Architecture
│   │   ├── (auth)/                 # Unauthenticated Routes Layout Isolating Public Forms
│   │   │   ├── login/page.tsx      # Zero-trust enterprise login form with error feedback
│   │   │   └── subscribe/page.tsx  # SEO-Optimized public lead onboarding application
│   │   ├── (dashboard)/            # Authenticated Publisher Layout (Requires Operator Token)
│   │   │   ├── layout.tsx          # Responsive navigation sidebar & wallet notification ticker
│   │   │   ├── page.tsx            # Live dashboard console with 1-click issue generation
│   │   │   ├── settings/page.tsx   # Masthead uploaders & default Ank issue configurator
│   │   │   ├── history/page.tsx    # Paginated R2 print archive with presigned downloaders
│   │   │   └── wallet/page.tsx     # Double-entry ledger audit log & Razorpay recharge modal
│   │   ├── (admin)/                # Protected RBAC Super Admin Enterprise Console Layout
│   │   │   ├── layout.tsx          # Security red-accented admin command navigation header
│   │   │   ├── page.tsx            # Global revenue metrics and worker queue monitoring
│   │   │   ├── users/page.tsx      # Tenant provisioning form & emergency block switches
│   │   │   └── leads/page.tsx      # Subscription inquiry CRM and 1-click conversion table
│   │   ├── api/                    # Frontend Proxy Handlers / Next Server Action endpoints
│   │   └── layout.tsx              # Global Root HTML Structure, Typography & Dark Mode provider
│   ├── components/                 # Modular Design System & ShadCN Reusable Primitives
│   │   ├── ui/                     # Accessible radix primitives (Button, Modal, Toast, Card, Dialog)
│   │   ├── common/                 # Theme switches, Loader wheels, Status badge indicators
│   │   └── newspaper/              # Masthead thumbnail previewers & Issue Ank increment preview
│   ├── hooks/                      # React Query Customized Hooks & Polling Handlers
│   │   ├── useNewspaperGen.ts      # Polling hook tracking async generation processing status
│   │   └── useWalletBalance.ts     # Real-time state cache for available wallet credits
│   ├── lib/                        # Client Architecture & State Helpers
│   │   ├── axios.ts                # Interceptor injecting Bearer JWT & handling 401 refresh rotation
│   │   ├── store.ts                # Zustand global client store (Active User, Profile Theme)
│   │   └── utils.ts                # Currency formatted (INR ₹) & RNI validation helpers
│   └── types/                      # Comprehensive Enterprise TypeScript Type Interfaces
│       ├── api.d.ts                # RFC 7807 standard error formats and pagination envelopes
│       └── publication.d.ts        # Issue metadata and R2 presigned object types
├── public/                         # Static visual icons & baseline system imagery
├── tailwind.config.ts              # Custom brand color tokens and responsive breakpoint parameters
├── tsconfig.json
└── package.json
```

---

## 4. 15-Sprint Engineering Development Roadmap (Deliverable #35)

To guarantee predictable execution and continuous testing, project deployment is organized into fifteen disciplined 2-week agile sprints:

```mermaid
gantt
    title Enterprise SaaS Newspaper Portal Roadmap (Sprints 1 - 15)
    dateFormat  YYYY-MM-DD
    section Phase 1: Core Architecture
    Sprint 1: Schema & Migrations       :active, sp1, 2026-08-01, 14d
    Sprint 2: Zero-Trust Auth & RBAC    :sp2, after sp1, 14d
    Sprint 3: Profile & R2 Masthead Ops :sp3, after sp2, 14d
    section Phase 2: Core SaaS Logic
    Sprint 4: Two-Phase Wallet Ledger   :sp4, after sp3, 14d
    Sprint 5: Razorpay & GST Invoicing  :sp5, after sp4, 14d
    Sprint 6: Auto-Ank & Issue Engine   :sp6, after sp5, 14d
    section Phase 3: Worker & UI Integration
    Sprint 7: Redis Queue & Asynq Workers :sp7, after sp6, 14d
    Sprint 8: Generator API Integration :sp8, after sp7, 14d
    Sprint 9: Next.js Publisher Portal  :sp9, after sp8, 14d
    section Phase 4: Enterprise Administration
    Sprint 10: Super Admin CRM Console  :sp10, after sp9, 14d
    Sprint 11: Audits, Logs & Telemetry :sp11, after sp10, 14d
    Sprint 12: Advanced Reports & KPIs  :sp12, after sp11, 14d
    section Phase 5: Hardening & Scale
    Sprint 13: Penetration & Security   :sp13, after sp12, 14d
    Sprint 14: Load Testing & 1M Scale  :sp14, after sp13, 14d
    Sprint 15: Production Go-Live & DRP :sp15, after sp14, 14d
```

### Detailed Sprint Milestones & Deliverables:
* **Sprint 1 (Database Core & Docker Infrastructure):** Implement PostgreSQL 3NF normalized schema, configure Goose database migration tools, set up local Docker Compose environments, and establish Go Fiber skeleton repositories.
* **Sprint 2 (Zero-Trust Security & Authentication):** Build JWT Access token parsing middleware, Redis Refresh Token cookie rotation, bcrypt password hashing, login brute-force account locking, and RBAC governance tables.
* **Sprint 3 (Publisher Profiles & R2 Object Storage):** Integrate Cloudflare R2 AWS V2 SDK endpoints, develop file upload sanitization handlers for logos/headers/signatures, and implement RNI compliance validation rules.
* **Sprint 4 (Wallet Ledger Accounting & Reserve Concurrency):** Construct double-entry immutable transaction ledger logic, build serializable row locking (`SELECT FOR UPDATE`), and engineer auto-refund fallback mechanics.
* **Sprint 5 (Razorpay Gateway Integration & Invoicing):** Integrate Razorpay cryptographic order generation, implement HMAC-SHA256 webhook signature validation, build automated GST invoice pdf calculation, and test idempotent recharge protection.
* **Sprint 6 (Auto-Issue Number Ank Calculation Algorithms):** Implement concurrency-proof Ank sequencing algorithms, date duplication guards, and weekly calendar schedule compliance checkers.
* **Sprint 7 (Redis Streams & Asynq Background Queue Processing):** Set up Asynq task dispatcher, define priority queue tiers (`critical`, `default`, `low`), configure worker daemons, and implement exponential retries.
* **Sprint 8 (External Newspaper Generator Engine Integration):** Establish secure HTTP connectors to external Newspaper Generator Engine, develop presigned asset URL payload generators, and implement streaming PDF capture into Cloudflare R2 storage buckets.
* **Sprint 9 (Next.js 15 Publisher Web Portal & ShadCN Design System):** Scaffolding Next.js App Router workspace, configure dual-mode Tailwind theme tokens, integrate Zustand client state, and assemble interactive publisher dashboards.
* **Sprint 10 (Enterprise Super Admin Control Panel & Lead Funnel):** Develop Super Admin tenant provisioning interfaces, build one-click lead conversion routines, and engineer account ban/suspension switches with real-time Redis session destruction.
* **Sprint 11 (Audit Trails, Logging Engine & Prometheus Telemetry):** Wire Zap/Zerolog structural JSON logging, set up immutable PostgreSQL `audit_logs` triggers, and deploy Prometheus runtime metrics scraping.
* **Sprint 12 (BI Analytics, Revenue Graphs & Administrative Reporting):** Implement SQL aggregating functions for monthly revenue trends, R2 cloud storage analytics, and integrate interactive Recharts visualization into Admin dashboards.
* **Sprint 13 (Penetration Testing, WAF Tuning & Helmet Hardening):** Perform comprehensive OWASP Top 10 security sweeps, test CSRF double-submit token resilience, verify Nginx security headers, and tune Cloudflare WAF bot defense thresholds.
* **Sprint 14 (High-Concurrency Load Testing & 1 Million User Scaling Validation):** Execute distributed Playwright and Locust simulated load testing against Go Fiber API pods, optimize database read-replicas, and test automated Redis cluster failovers.
* **Sprint 15 (Production Go-Live, Final Disaster Recovery Verification & Hand-Off):** Complete production sign-off checklist, conduct simulated Point-in-Time Recovery (PITR) failover drills, lock live DNS routing, and transfer architectural custodianship to enterprise operations teams.
