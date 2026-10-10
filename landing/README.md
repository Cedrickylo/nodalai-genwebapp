# Nodal AI — Standalone Informative Landing Page

This folder contains the complete, production-ready, standalone landing page for **Nodal AI**, engineered to be deployed independently on a custom domain (e.g., `nodal.ai` or any secondary domain/subdomain).

---

## 🚀 Quick Deployment Guide

### Option 1: Deploy on Vercel (Recommended)
1. **New Project**: Go to your [Vercel Dashboard](https://vercel.com/) and click **Add New... &rarr; Project**.
2. **Select Repository**: Select `nodalai-genwebapp`.
3. **Configure Root Directory**:
   - In **Project Settings**, edit the **Root Directory** field.
   - Set it to `landing`.
4. **Deploy**: Click **Deploy**. Vercel will automatically apply the security headers, HSTS, CSP, and clean URLs configured in `landing/vercel.json`.
5. **Add Custom Domain**: Under Project Settings &rarr; Domains, assign your custom domain.

### Option 2: Deploy on Cloudflare Pages
1. In Cloudflare Dashboard, go to **Workers & Pages &rarr; Create application &rarr; Pages &rarr; Connect to Git**.
2. Select your repository.
3. In **Build Settings**:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `landing`
4. Deploy and connect your domain.

### Option 3: Deploy on Netlify
1. In Netlify Dashboard, click **Add new site &rarr; Import an existing project**.
2. Set **Base directory** to `landing`.
3. Set **Publish directory** to `landing`.
4. Deploy site and add custom domain.

---

## 🎨 Design & Craft Standards

Built in adherence with:
- **[Apple Design Guidelines (WWDC Fluid Interfaces)](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)**:
  - Zero-latency feedback on pointer-down with 1:1 physical compression (`scale(0.97)` on `:active`).
  - Elimination of ~300ms mobile tap delay (`touch-action: manipulation`).
  - Translucent materials with specular light reflections (`backdrop-filter: blur(20px) saturate(180%)`).
  - Optical typography hierarchy using native system fonts (`-apple-system, SF Pro, Inter`).
  - Zero-dependency Web Audio API synthesizer chimes.
- **[Biscuit Event-Conf Aesthetics](https://github.com/biscuitben2021-tech/biscuit-skills-website/blob/master/event-conf/SKILL.md)**:
  - 3-stop warm-to-cool hero gradient headline (`#6366f1` &rarr; `#a855f7` &rarr; `#06b6d4`).
  - Monospace trust lines and focal metric card in hero negative space.
  - Dark inverted ticket / CTA band.
- **[Awesome AI Skills](https://github.com/skillsdirectory/awesome-ai-skills)**:
  - Direct comparison matrix (*Nodal AI vs Traditional Quiz Makers*).
  - Open agent skills specification and transparent subprocessor tables.

---

## 🛡️ Security & Privacy Compliance

- **OWASP 20-Point Standard**: Strictly verified and enforced.
- **HSTS**: `max-age=63072000; includeSubDomains; preload`.
- **COPPA & Minor Protection**: Built-in parental consent modal for users under 13 and minor student consent.
- **GDPR / CCPA Rights**: 1-click local device data destruction and self-service data deletion request form.
- **Zero Third-Party Advertising**: No tracking cookies, no cross-site pixels, 100% client-side document processing.
