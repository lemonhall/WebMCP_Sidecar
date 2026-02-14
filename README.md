# WebMCP Sidecar (Chrome MV3)

WebMCP Sidecar is a **Chrome extension** (Manifest V3 + Side Panel + Options/Settings) that can:
- Discover **WebMCP tools** exposed by the current page (via `navigator.modelContext` / WebMCP demos)
- Call those tools from the Side Panel **Inspector**
- Run a basic **Chat Agent** in the Side Panel that can use page tools + local “shadow workspace” tools (OPFS) + web tools

中文说明：`README.zh_ch.md`

## For beginners: install the extension (unpacked)

This project is intended for **Developer Mode** (not Chrome Web Store).

1) Clone / download this repo
- If you download a ZIP from GitHub, unzip it to a folder like `WebMCP_Sidecar/`

2) Open Chrome Extensions page
- Go to `chrome://extensions`
- Turn on **Developer mode** (top-right)

3) Load the extension
- Click **Load unpacked**
- Select the folder: `WebMCP_Sidecar/extension/`

4) Open the Side Panel
- Click the extension icon (or pin it first)
- Chrome should open a **Side Panel** for this extension

## Quick start (WebMCP flight demo)

1) Open the WebMCP flight search demo:
- `https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/`

2) In the Side Panel, open **Inspector**
- Click **Refresh** to list tools
- Pick `searchFlights`, then **Call**

Known-good input:
```json
{"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}
```

## Chat Agent (Phase 1)

The Side Panel **Chat** can:
- Stream responses
- Show tool-use events and (truncated) tool results
- Reload tools after tab navigation (URL changes)
- Copy the whole conversation transcript

### Configure LLM settings

Open `Options/Settings` and fill:
- `baseUrl`
- `model`
- `apiKey`

The provider expects an **OpenAI Responses API compatible** endpoint.

### Skills (Meta Tool) + OPFS shadow workspace

The extension maintains a private file tree in OPFS under:
- `.agents/skills/*`
- `.agents/sessions/*`

Built-in skills will be installed into OPFS on first use of `ListSkills` / `Skill`, including:
- `hello-world`
- `deep-research`
- `find-skills`
- `brainstorming`
- `skill-creator`

Usage: type `$deep-research` (or any `$<skill-name>`) in Chat to request loading that skill.

## Developer commands (PowerShell)

- Verify (structure): `powershell -File scripts/verify.ps1`
- Install (Playwright): `npm install ; npx playwright install chromium`
- Run E2E: `npm run test:e2e`
- Run one test: `npx playwright test tests/e2e/phase1-agent.spec.ts`

## Docs (PRD / Plans / ECNs)

- PRD: `docs/prd/PRD-0001-webmcp-sidecar.md`
- Phase 1 PRD: `docs/prd/PRD-0002-webmcp-sidecar-phase1-agent.md`
- Plans: `docs/plan/`
- ECNs: `docs/ecn/`
- Research: `docs/research/`
