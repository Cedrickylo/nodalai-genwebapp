# Third-Party SDK & Dependency Security Audit

Date: September 2026  
Project: **Nodal AI (`nodalai-genwebapp`)**  
Auditor: Automated Security & Architecture Review  

---

## 1. Executive Summary

This document presents a comprehensive security, data privacy, and integrity audit of all external third-party SDKs, libraries, and content delivery networks (CDNs) utilized within the Nodal AI web platform. 

The application is structured to maximize user privacy:
- **Zero Third-Party Advertising / Behavioral Trackers**: No Google Analytics, Facebook Pixel, Mixpanel, or advertising cookies are integrated.
- **Client-Side Document Processing**: Document parsing (PDF, DOCX, TXT) occurs entirely in-browser. Source documents are never stored permanently on remote database servers.
- **Strict HTTPS & CSP**: External communication is locked down to verified API origins via Content Security Policy and serverless proxies.

---

## 2. Third-Party CDN Dependency Inventory

| Dependency | Loaded Version | Source CDN | Purpose | Privacy & Data Isolation Assessment | Risk Level |
|---|---|---|---|---|---|
| **Tailwind CSS** | CDN Runtime | `cdn.tailwindcss.com` | Utility-first CSS styling framework | Generates CSS in the browser; transmits zero user data or telemetry. | Low |
| **Mammoth.js** | 1.6.0 | `cdnjs.cloudflare.com` | Client-side Word `.docx` parsing | Operates entirely in browser memory; no external network requests made during parsing. | Low |
| **PDF.js** | 2.11.338 | `cdnjs.cloudflare.com` | Mozilla PDF text extraction | Processes PDF files locally inside HTML5 Canvas/Worker context without outbound transmissions. | Low |
| **Crypto-JS** | 4.1.1 | `cdnjs.cloudflare.com` | Client-side AES-256 encryption | Encrypts local quiz records and exported `.nodal` backups; runs completely offline. | Low |
| **Puter.js** | v2 | `js.puter.com` | Cloud filesystem & user session SDK | Sandboxed user filesystem (`/app/nodal_ai/...`). Requests go strictly to `api.puter.com` via TLS. User identity is isolated to Puter's auth boundary. | Medium / Monitored |
| **LZ-String** | 1.5.0 | `cdnjs.cloudflare.com` | String compression for share links | Compresses URL payloads in memory; zero network access. | Low |
| **JSZip** | 3.10.1 | `cdnjs.cloudflare.com` | Archive & PPTX extraction | Reads zip structures locally in memory; zero network access. | Low |
| **Google Inter Font** | Web Font | `fonts.googleapis.com` | Typography | Fetches standard font faces; no user identifiers transmitted. | Low |

---

## 3. Data Flow & Subprocessor Disclosures

1. **Google Gemini API**:
   - **Endpoint**: `https://generativelanguage.googleapis.com` (proxied via Vercel `/api/generate-quiz`).
   - **Data Transmitted**: Ephemeral prompt text constructed from user-uploaded study notes.
   - **Data Retention**: Under Google API policies for paid/serverless developer tiers, prompt data is processed ephemerally and is not retained for model training.
   - **Secret Protection**: The `GEMINI_API_KEY` is securely stored in Vercel Serverless environment variables and is never exposed to the client.

2. **Puter.com (Cloud Sync Provider)**:
   - **Endpoint**: `https://api.puter.com`.
   - **Data Transmitted**: Encrypted quiz database files (`nodal_quiz_sync_v4.json`), take history, and user preferences.
   - **Access Control**: Scoped strictly to the authenticated user's isolated sandboxed directory.

3. **Link Shorteners (TinyURL / CleanURI)**:
   - **Endpoint**: `https://tinyurl.com` and `https://cleanuri.com`.
   - **Data Transmitted**: Encrypted quiz URL hash string (only when user explicitly requests a share link).
   - **Fallback**: If external shorteners are unavailable or blocked, the application returns the original full URL with zero degradation.

---

## 4. Security Hardening Controls Implemented

- **CORS Lockdown**: Wildcard `*` removed from all serverless endpoints; cross-origin requests are restricted to approved domains.
- **Request Throttling**: Rate limiting applied to generation endpoints (10/hr) and shortening endpoints (15/min).
- **Prompt Injection Defense**: Serverless filtering scans for adversarial instruction override keywords before dispatching payloads to the AI model.
- **Payload Caps**: Strict 500KB body limit and 50,000 character prompt limit prevent serverless resource exhaustion.
- **HSTS & Security Headers**: Strict-Transport-Security (`preload`, 2-year max-age), CSP, X-Frame-Options, X-Content-Type-Options, and Permissions-Policy enforced across all responses.
