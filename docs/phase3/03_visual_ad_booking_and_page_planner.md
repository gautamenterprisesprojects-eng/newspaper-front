# Phase 3 Volume 3: Visual Advertisement Booking & Page Planner Engineering

**Project:** Newspaper Automatic Composition Enterprise ERP Platform (Phase 3)  
**Target Audience:** Advertising Directors, Commercial Business Heads, Prepress Layout Artists  
**Modules Covered:** Module 8 (Advertisement Booking), Module 9 (Advertisement Planner), Module 10 (Page Planning)  
**Deliverables Answered:** #8 (Advertisement Workflow Diagram), #12 (UI Wireframes for Prepress Grid)

---

## 1. Commercial Advertisement Booking & Statutory Rate Card Engine (Module 8)

Newspaper profitability is driven by commercial advertising contracts. Our ERP transforms informal ad placements into a rigorous, audit-proof booking and invoicing lifecycle.

### 1.1 Client, Agency & Campaign Management
* **Entity Relationship:** Tracks advertising clients (e.g., *Tata Motors*, *ICICI Bank*) and recognized media booking agencies (e.g., *GroupM*, *Madison Media*), including standard 15% agency commission deduction terms and statutory GSTIN registration identifiers.
* **Advertisement Typology & Categories:** 
  - **Display Advertisements:** High-impact graphic banners with exact geometric column centimeter specifications (e.g., Front Page Bottom Solus, Full Page Display, Jacket Covers).
  - **Classified Lineage & Display:** Text-based recruitment, real estate, and matrimonial notices priced per line or square character.
  - **Statutory & Government Tenders:** Municipal legal notifications requiring verified digital publication proof certificates.
  - **Political & Festival Supplements:** Special event promotional layouts subject to specific Election Commission verification protocols.

### 1.2 Statutory GST & Rate Card Calculation Matrix
When an ad is booked, the backend evaluates pricing against the organization's dynamic rate cards:
* **Base Calculation:** $\text{Gross Amount} = (\text{Width in Columns} \times \text{Height in cm}) \times \text{Rate Per Col-cm}$
* **Page Preference & Premium Surcharges:** Applies automatic percentage uplifts for premium locations (e.g., $+100\%$ surcharge for Page 1 Solus, $+50\%$ for Page 3 Top Right, $+25\%$ for Back Page).
* **Statutory GST Compliance:** Computes exact 5% Indian Print Media GST tax breakdowns (2.5% CGST + 2.5% SGST for intra-state bookings; 5% IGST for inter-state contracts) before generating enforceable billing invoices in Module 15.

---

## 2. Visual Advertisement & Page Planner Engine (Modules 9 & 10)

To eliminate layout confusion where sales teams inadvertently promise the exact same Front Page placement to rival advertisers, we engineer a real-time **Geometric Grid & Collision Detection Engine**.

### 2.1 Page Layout Geometric Grid Specification (Module 10)
Each page of a scheduled newspaper edition (e.g., Page 1 to 12 of Daily Morning Broadsheet) is segmented into a precise mathematical pixel and column coordinate system within the database (`page_plan_slots`):
* **Standard Broadsheet Geometry:** **8 Horizontal Columns** $\times$ **54 Centimeters Vertical Height** $=$ **432 Column-Centimeters** total printable area per page.
* **Coordinate Mapping (X, Y, W, H):** Every visual slot is assigned strict grid boundaries:
  - `start_column (X)`: Integer between 1 and 8.
  - `start_height_cm (Y)`: Decimal between 0.00 and 54.00.
  - `width_columns (W)`: Integer width span (e.g., 4 columns wide).
  - `height_cm (H)`: Decimal height span (e.g., 20.0 cm tall).

```
+-----------------------------------------------------------------------+
|  PAGE 1: MASTER BROADSHEET GRID (8 COLUMNS WIDE x 54 CM HIGH)         |
+-----------------------------------------------------------------------+
| [Col 1] | [Col 2] | [Col 3] | [Col 4] | [Col 5] | [Col 6] | [Col 7] | [Col 8] | <-- 0 cm (Top)
+-----------------------------------------------------------------------+
|                                                                       |
|  [SLOT A: MASTHEAD & ISSUE ANK #126 - RESERVED FIXED HEADER (8x6 cm)] |
|                                                                       | <-- 6 cm
+-----------------------------------------------------------------------+
|                                                           |           |
|                                                           | [SLOT B:  |
|  [SLOT C: EDITORIAL LEAD STORY ARTICLE (#891)]            |  ADVERT]  |
|   Headline: "Union Budget Proposes New Press Tax Incentives"|  Agency   |
|   Assigned by Newsroom CMS (Columns 1 to 5, Height 28 cm) |  Campaign |
|                                                           | (3x28 cm) |
|                                                           |  LOCKED   |
|                                                           |           | <-- 34 cm
+-----------------------------------------------------------------------+
|                                                                       |
|  [SLOT D: FRONT PAGE BOTTOM SOLUS ADVERTISEMENT (#412)]               |
|   Client: Tata Motors (Columns 1 to 8 Wide x 20 cm High = 160 Col-cm)  |
|   Status: CONFIRMED BOOKING & GST INVOICED                            |
|                                                                       | <-- 54 cm (Bottom)
+-----------------------------------------------------------------------+
```

### 2.2 Real-Time Collision Detection & Availability Engine (Module 9)
When a user drags an advertisement or article onto the visual page planner grid, the Go Fiber API executes an instantaneous geometric boundary intersection query against `page_plan_slots`:

```mermaid
sequenceDiagram
    autonumber
    actor AD as Ad Sales Manager
    participant API as Go Fiber Ad Planner Service
    participant PG as PostgreSQL 16
    
    AD->>API: POST /api/v1/erp/planner/slots (Book Front Page Solus: X=1, Y=34, W=8, H=20)
    API->>PG: Query existing slots on Page 1 for Target Issue Date & Edition
    Note over API,PG: Collision Algorithm Evaluation:<br/>Overlap = (New.X < Old.X + Old.W) AND (New.X + New.W > Old.X)<br/>AND (New.Y < Old.Y + Old.H) AND (New.Y + New.H > Old.Y)
    
    alt Geometric Boundary Overlap Detected
        PG-->>API: Conflict identified with existing Slot D (Tata Motors Solus)
        API-->>AD: HTTP 409 Conflict ("ERR_GRID_SPACE_TAKEN: Solus space already invoiced; try Page 3 or Date +1")
    else Grid Surface Available
        API->>PG: Insert slot record (status = 'LOCKED_RESERVED')
        API->>API: Deduct available col-cm from total page capacity
        API-->>AD: HTTP 201 Created + Live WebSocket grid refresh to Editorial team
    end
```

* **Availability Calendar Visualization:** Advertising managers can open an interactive monthly calendar displaying visual heatmap utilization per edition page (e.g., `"October 24th Diwali Issue Page 1: 100% Sold Out; Page 3: 40% Available"`), optimizing ad sales efficiency and eliminating prepress layout bottlenecks.
