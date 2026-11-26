# Changelog

## v1.0.0 — 2024

### Initial Production Release

**Core Platform**
- Monorepo: `apps/teacher-desktop`, `apps/student-kiosk`, `apps/server`, `services/cctv-vision`, `packages/shared`
- Prisma SQLite embedded database with zero-config local deployment
- mDNS lab server discovery (`secureassess-lab.local`)

**Security**
- Zero-leak question delivery — `correctIndex` never sent to student client
- HMAC-signed answer packets with monotonic seq anti-replay
- SHA-256 hash-chained violation audit log (tamper-evident)
- `@electron/fuses`: `runAsNode: off`, `nodeCliInspect: off`, `onlyLoadAppFromAsar: on`
- `sandbox: true` + strict CSP on all `BrowserWindow` instances
- `safeStorage` encrypted API keys at rest
- VM / RDP / multi-monitor detection guard
- Lab Host bootstrap + Faculty Registration PIN gate (prevents student self-registration)

**Teacher Desktop**
- NOC-aesthetic dark dashboard with live system grid
- Dual-pane projector mode (leaderboard + integrity ticker)
- 4-corner CCTV calibration wizard
- PDF-to-MCQ generation (online: OpenAI/Groq/Gemini; offline: Ollama)
- Anti-adjacency seating shuffle engine
- Portable `.saexam` USB bundle export/import
- 1-click certificate generation with HMAC-signed QR codes
- Forensic PDF with hash-chain integrity verification

**Student Kiosk**
- OS-level KIOSK lockdown (`kiosk: true`, `alwaysOnTop`, blocked shortcuts)
- WINDOWED mode with Electron `blur` event violation reporting
- Browser-level anti-cheat: tab-switch, DevTools detection, fullscreen enforcement
- Per-session HMAC secret + SubtleCrypto packet signing
- LAN-drop resilient with pending-answer buffer and reconnect sync

**CCTV Vision Service**
- MediaPipe FaceLandmarker head-pose estimation (yaw/pitch)
- 4-second violation debounce with JPEG forensic snapshots
- PyInstaller single-folder bundle for lab deployment without Python

**E2E Test Suite**
- 21/21 assertions passing (`node:test` + `socket.io-client`)
- Covers: firewall, seating, zero-leak delivery, HMAC replay, CCTV bridge, grading, PDF exports
