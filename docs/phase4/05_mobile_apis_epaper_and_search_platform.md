# Phase 4 Volume 5: Mobile APIs, Public ePaper, Digital Archive & Search

**Project:** Newspaper Automatic Composition Enterprise Publishing Ecosystem (Phase 4)  
**Target Audience:** Mobile iOS/Android Engineers, Digital ePaper Developers, Data Archival Managers  
**Modules Covered:** Module 5 (Mobile API), Module 6 (Public ePaper API), Module 13 (Digital Archive), Module 14 (Search Platform)  
**Deliverables Answered:** #12 (Comprehensive API Specifications), #24 (Future Evolution & Scaling Plan)

---

## 1. Native Mobile App Integration APIs & Offline Sync (Module 5)

Modern newspaper journalists write stories in the field while subscribers consume breaking news via native apps. We expose specialized low-bandwidth JSON APIs optimized for **Android (Kotlin), iOS (SwiftUI), Flutter, and React Native**:

### 1.1 Mobile API Architecture & Capabilities
* **Lightweight Payloads & Brotli Compression:** All mobile endpoints under `/api/v2/gateway/mobile/...` apply gzip/Brotli compression, returning minimalist JSON structures stripping unnecessary metadata to conserve battery and cellular data.
* **Offline Synchronization Engine:** Field correspondents working in remote agricultural districts without consistent 4G/5G connectivity can compose articles and queue DAM photos inside SQLite local storages. Upon regaining internet connection, the mobile app performs an atomic **Delta Offline Sync**, pushing drafted stories to our Phase 3 Module 5 Article Repository while merging any server-side revisions.
* **Push Notification Hooks (Firebase Cloud Messaging - FCM & Apple Push Notification Service - APNs):** Integrates with our Phase 4 Module 3 Webhook Engine and Asynq event bus to fire high-priority mobile push alarms when breaking editorial stories drop or newsroom assignments approach their deadline.

---

## 2. Public ePaper Reader & Archival Syndication API (Module 6)

To empower external digital publishers to build their own custom reader apps or integrate newspaper editions into third-party enterprise platforms, we expose the **Public ePaper REST API**:
* **Comprehensive Endpoint Exposure:**
  - `GET /api/v2/gateway/epaper/issues` (List historical and recent newspaper issues by edition and date)
  - `GET /api/v2/gateway/epaper/issues/:id/pages` (Extract page image coordinates and sRGB JPEG URLs)
  - `GET /api/v2/gateway/epaper/search` (Search headline text OCR coordinates within digital broadsheet canvases)
  - `POST /api/v2/gateway/epaper/bookmarks` (Save favorite article bookmarks to a user's reader account)
  - `PUT /api/v2/gateway/epaper/reading-progress` (Sync real-time page reading completion percentage across devices)
  - `GET /api/v2/gateway/epaper/download` (Request presigned watermark PDF download link for Pro subscribers)
* **Hybrid Paywall Shield Integration:** Requests attempting to fetch page payloads for historical issues older than 7 days automatically trigger an inline validation check against our Phase 4 Module 7 Digital Subscription entitlements!

---

## 3. Digital Archive & Long-Term Cold Storage Vaults (Module 13)

Maintaining decades of historical broadsheet newspaper editions (averaging 50 MB per high-res versioned PDF) requires a multi-tiered archival storage strategy (`cold_storage_archives`).

### 3.1 Tiered Storage Retention Policies
* **Hot Active Tier (0 to 30 Days - Cloudflare R2):** All newly printed newspaper editions and high-resolution 300 DPI DAM photos reside on high-performance Anycast NVMe edge buckets for instantaneous reader and editor streaming.
* **Warm Archival Tier (31 Days to 1 Year - AWS S3 Standard-Infrequent Access):** Automated Asynq daemons migrate aging issues to warm storage, reducing monthly object storage expenditures by 50% while preserving sub-second read speeds for ePaper readers.
* **Cold Vault Tier (Older than 1 Year - AWS Glacier / R2 Deep Archive):** Historical issues shift into Deep Archive vaults. If a researcher or legal auditor requests an issue from 1995, the system initiates a background data restore job, dispatching a presigned notification link within 3 to 5 hours!

---

## 4. Elastic & Meilisearch Ready Universal Search Platform (Module 14)

While our Phase 3 PostgreSQL 16 **GIN Trigram Indexing Engine** delivers sub-second results up to millions of records, enterprise media houses scaling to hundreds of millions of archive items require dedicated search clusters.

### 4.1 Search Abstraction Architecture
We implement an abstracted search repository layer (`internal/services/search_engine.go`) supporting hot-swappable search providers:
* **Default Postgres GIN Engine:** Keeps operations lightweight and infrastructure maintenance costs low for small and regional publishing groups.
* **Elasticsearch / Meilisearch Cluster Ready:** By updating an environment configuration (`SEARCH_PROVIDER=meilisearch` or `elasticsearch`), our Phase 4 Module 17 Event Bus automatically pipes atomic domain events (`article.created`, `invoice.issued`, `user.registered`) into dedicated external search indexes without modifying route logic!
* **Unified Multi-Index Search Scope:** A single API query to `/api/v2/gateway/search?q=Elections` queries simultaneously across 10 distinct indices: Articles, Generated PDFs, DAM Images, Asset Folders, Advertisements, GST Invoices, Users, Organizations, CRM Leads, and Supplier POs!
