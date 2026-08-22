# Phase 3 Volume 5: Circulation Distribution ERP, Customer Subscriptions & Public ePaper Reader

**Project:** Newspaper Automatic Composition Enterprise ERP Platform (Phase 3)  
**Target Audience:** Circulation Directors, Distribution Fleet Managers, Digital Growth Executives  
**Modules Covered:** Module 13 (Distribution Management), Module 14 (Customer Subscriptions), Module 19 (Public ePaper), Module 20 (Public Website CMS)  
**Deliverables Answered:** #10 (Distribution Workflow Diagram), #12 (UI Wireframes for Circulation & ePaper)

---

## 1. Circulation & Vendor Distribution ERP (Module 13)

Once high-speed web offset press machines finalize daily print orders at 2:00 AM, thousands of bundled newspapers must depart via coordinated physical logistics fleets before morning commuter rushes.

### 1.1 Distribution Entities & Fleet Route Topology
* **Hierarchical Distribution Network:** Tracks regional Distribution Centers $\to$ Master City Agents $\to$ District Newspaper Dealers $\to$ Local Street News Vendors.
* **Vehicle Fleet & Route Optimization:** Binds daily copy bundles to designated transport vehicles (e.g., delivery vans, courier motorcycles) assigned to precise GPS delivery circuits (`distribution_routes`).
* **Dispatch & Return Ledger (`distribution_ledgers`):**
  - **Early Morning Dispatch (3:00 AM):** Records exact copy quantities loaded onto delivery vans and handed off to regional dealers.
  - **Afternoon Unsold Copy Returns (3:00 PM):** In daily newspaper circulation, vendors return unsold physical copies for financial credit against their account.
  - **Monthly Reconciliation Rule:** Daily returns aggregate into a running ledger balance without generating 30 daily credit notes. At month-end, the ERP automatically synthesizes a single consolidated **Statutory GST Credit Note** in Module 15, streamlining compliance while maintaining precision inventory tracking.

```mermaid
sequenceDiagram
    autonumber
    actor PLANT as Printing Press Warehouse
    actor DRIVER as Route Fleet Driver (Van #4)
    actor VENDOR as Local Newsstand Vendor (Pune Central)
    participant ERP as Go Fiber Distribution ERP
    participant PG as PostgreSQL 16
    
    PLANT->>ERP: POST /api/v1/erp/distribution/dispatches (Load 5,000 Copies for Van #4)
    ERP->>PG: Debit warehouse finished goods inventory; mark Route 4 active
    DRIVER->>VENDOR: Hand over 500 copies at 4:30 AM (Digital Proof of Delivery verified via mobile signature)
    ERP->>PG: Record 500 copies delivered in vendor distribution_ledgers (Status: DELIVERED)
    
    Note over VENDOR,ERP: 3:30 PM: Business day closes; Vendor has 24 unsold copies remaining on newsstand
    VENDOR->>ERP: POST /api/v1/erp/distribution/returns (Submit 24 Unsold Returns barcode verification)
    ERP->>PG: Log 24 return copies in ledger; calculate net billable copies = 476
    ERP-->>VENDOR: Return confirmed! Running monthly account ledger credited automatically.
```

---

## 2. Customer Subscriptions & Doorstep Delivery MIS (Module 14)

Managing thousands of direct-to-home consumer newspaper subscribers requires specialized routing and lifecycle tracking within `customer_subscriptions`:
* **Subscriber Profile:** Records subscriber residential address, geo-coordinates, assigned local delivery newsstand vendor, and selected newspaper sub-editions (e.g., Daily Morning + Sunday Magazine bundle).
* **Subscription Billing Plans:** Supports prepaid quarterly, semi-annual, and annual recurring billing cycles integrated directly with our Phase 1 **Razorpay Payment Gateway** webhooks for automated renewal invoicing.
* **Vacation Pause Delivery Engine:** Subscribers can set temporary delivery pause dates (e.g., `"Pause print newspaper delivery from Aug 10 to Aug 20 while travelling"`). The backend automatically alters daily distribution vendor bundle quotas and extends the customer's subscription expiry date by the equivalent 10 days!

---

## 3. Public ePaper Reader Web Portal & Archival CMS (Modules 19 & 20)

To monetize digital readership across global diaspora audiences, the ERP exposes an automated **Public ePaper Web Portal** (`epaper.tenant-publication.com`) directly driven by our Phase 2 Cloudflare R2 versioned PDF storage vaults.

### 3.1 Public ePaper Showcase & Interactive Reader (Module 19)
* **Zero-Copy R2 Archival Serving:** When a publisher approves a newspaper issue in Module 6 and generates an R2 PDF master in Module 11, background Asynq workers extract high-resolution sRGB JPEG page images and text OCR coordinates, publishing them instantaneously to the public ePaper portal without manual file uploading.
* **Hybrid Paywall & Subscription Access Shield:** 
  - **Recent Daily Editions (Last 7 Days):** Freely accessible and shareable via social links to drive visitor traffic and digital ad impressions.
  - **Historical Archival Vault (Older than 7 Days):** Access attempts to older issues automatically trigger an interactive authentication modal requiring an active verified digital subscription from Module 14.

### 3.2 Public Website Content Management System - CMS (Module 20)
Newsroom editors govern public-facing promotional pages through a headless CMS panel (`public_cms_pages`):
* **Dynamic Content Management:** Instantly update Homepage announcements, Editorial Board About Us profiles, Legal Terms of Service, Privacy Policies, and statutory RNI declaration statements.
* **SEO Metadata Injection:** Automatically injects Schema.org JSON-LD structured news metadata, dynamic OpenGraph sharing graphics, and verified XML sitemap routes into public responses to dominate search rankings.
