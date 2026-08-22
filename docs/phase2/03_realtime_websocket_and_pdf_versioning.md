# Phase 2 Volume 3: Real-Time WebSocket Engine, Queue Monitor & PDF Versioning

**Project:** Newspaper Automatic Composition SaaS Platform (Phase 2 — Publisher Experience)  
**Target Audience:** Backend Systems Engineers, Network Protocol Specialists, Frontend Interactive Devs  
**Modules Covered:** Module 9 (Generation Queue), Module 10 (Live Status WebSockets), Module 11 (PDF Versioning), Module 12 (Browser PDF Canvas Previewer)

---

## 1. Real-Time WebSocket & Redis Pub/Sub Architecture (Modules 9 & 10)

To provide an interface resembling modern collaborative tools like Figma or Canva, publishers generating complex 24-page newspaper editions must receive real-time, zero-polling feedback as background GPU and rendering engines process their files.

### 1.1 Distributed Pub/Sub Relay Topology
We integrate `@gofiber/websocket/v2` with Redis Pub/Sub channels. When an operator triggers generation, an isolated live duplex stream opens between their browser and our backend cluster.

```mermaid
sequenceDiagram
    autonumber
    actor CLI as Next.js 15 Client Studio
    participant WS as Go Fiber WebSocket Gateway (/ws/v1/live)
    participant RD as Redis Pub/Sub (Topic: ws:pubsub:gen_job:UUID)
    participant WKR as Asynq Generation Worker Daemon
    participant ENG as External Newspaper Generator Engine
    
    CLI->>WS: Upgrade HTTP to WebSocket: /ws/v1/live?job_id=job_891&token=jwt
    WS->>WS: Verify JWT & tenant authorization; Subscribe to Redis channel
    WS-->>CLI: WebSocket Connection Established (101 Switching Protocols)
    
    Note over WKR,ENG: Background Asynq Task Execution Begins
    WKR->>RD: PUBLISH ws:pubsub:gen_job:job_891 '{"step":1,"state":"PREPARING","progress":10,"desc":"Initializing workspace..."}'
    RD->>WS: Relay Event over Channel
    WS->>CLI: Push Real-time JSON Frame over WS (No page refresh!)
    
    WKR->>RD: PUBLISH '{"step":2,"state":"COLLECTING_ASSETS","progress":30,"desc":"Fetching R2 CMYK mastheads & ads..."}'
    RD->>WS: Relay Event
    WS->>CLI: Update Progress Bar & Animation state in DOM
    
    WKR->>ENG: Transmit payload; Engine performs heavy PDF vector rendering
    WKR->>RD: PUBLISH '{"step":3,"state":"RENDERING_CMYK","progress":70,"desc":"Synthesizing offset bleed marks & fonts..."}'
    RD->>WS: Relay Event
    WS->>CLI: Push Real-time JSON Frame
    
    WKR->>RD: PUBLISH '{"step":4,"state":"COMPLETED","progress":100,"pdf_url":"https://cdn.../v1.pdf","wallet_debited":100}'
    RD->>WS: Relay Event
    WS->>CLI: Display Success Confetti & Render PDF Canvas Previewer
    CLI->>WS: Close WebSocket Connection (Clean Disconnect 1000)
```

### 1.2 Queue Position & Concurrency Monitor (Module 9)
During peak newspaper publishing hours (e.g., midnight to 3 AM IST before morning print distribution), hundreds of regional editions render simultaneously. The WebSocket stream transmits real-time Asynq queue metrics:
* **Queue Position Ticker:** `"You are currently #4 in the Critical Generation Queue."`
* **Estimated Completion Calculator:** Computes estimated time remaining based on active worker throughput (`estimated_remaining_sec = queue_position * average_job_duration_sec`).
* **Operator Interventions:** Provides real-time buttons over WS/REST to **Cancel Job** (immediately drops task from Redis Asynq queue and refunds reserved ₹100 wallet balance) or **Retry Failed Rendering**.

---

## 2. Immutable PDF Versioning Architecture (Module 11)

In professional publishing, an editor frequently discovers typographical errors or late-breaking news updates right after generating a proof. Rather than overwriting existing PDF files, our architecture enforces strict version lineage.

### 2.1 Parent-Child Versioning Model (Zero Overwriting)
When a newspaper edition is regenerated for the identical issue date and Ank number, the system creates a new child version record in the database while retaining previous R2 storage objects:

```
Cloudflare R2 Bucket Structure:
├── publications/
│   └── org_9921/
│       └── 2026/08/03/
│           ├── ank_126_v1_proof_draft.pdf   [Created: 22:15 UTC - Status: ARCHIVED_DRAFT]
│           ├── ank_126_v2_editor_revised.pdf [Created: 22:45 UTC - Status: ARCHIVED_DRAFT]
│           └── ank_126_v3_print_final.pdf    [Created: 23:10 UTC - Status: ACTIVE_MASTER]
```

* **Comparison & Restore Capabilities:** The Next.js studio UI displays a visual Version History timeline dropdown. Editors can click `"Restore v2 as Active Master"`, which re-links the press operator download targets to the verified v2 file without re-charging the organization's Razorpay wallet.
* **Storage Limit Governance:** All historical versions count against the publisher's License Storage Limit (Module 1). When storage capacity approaches 95%, an automated warning prompts administrators to execute bulk deletion of obsolete intermediate draft versions (v1, v2) while retaining final print masters.

---

## 3. Interactive In-Browser PDF Canvas Previewer (Module 12)

To eliminate workflow friction caused by forcing operators to continually download multi-megabyte files simply to verify margin alignment or advertisement placement, we integrate an advanced client-side browser rendering canvas.

### 3.1 PDF.js Canvas Architecture & Interactive Tooling
The frontend previewer utilizes optimized PDF.js Web Workers running directly within the Next.js memory sandbox:
* **Zoom & Pan Engine:** Smooth scroll zooming from **25% thumbnail overview up to 800% micro-typography inspection**, enabling editors to inspect halftone dot gain and bleed margins with extreme precision.
* **Interactive Tool bar:**
  - **Full-Screen Workspace:** Expands the PDF proof across dual-monitor newsroom desktop screens.
  - **Text Keyword Finder:** Scans extracted PDF text streams to verify that breaking headline keywords or mandatory regulatory RNI numbers appear on the front page.
  - **Page Rotation & Thumbnails:** Rapid thumbnail sidebar navigation for leaping across 24-page broadsheet editions instantly.
  - **Secure Press Share & Direct Print:** Generates a 2-hour encrypted share link for external advertising sponsors to approve ad layouts, or triggers native browser print spooling directly to newsroom laser proofing printers.
