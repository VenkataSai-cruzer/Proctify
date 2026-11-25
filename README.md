# SecureAssess

**Production-grade Lab Examination, Anti-Cheat & Central CCTV Proctoring Platform**

A full-stack, LAN-distributed desktop application for college computer labs supporting Windows and Ubuntu/Debian Linux.

---

## Monorepo Structure

```
secureassess/
├── apps/
│   ├── teacher-desktop/     Electron 31 + React 18 + Vite + Tailwind + Framer Motion
│   ├── student-kiosk/       Electron Kiosk + React Student Exam UI
│   └── server/              Node.js + Express + Socket.IO + Prisma (SQLite)
├── services/
│   └── cctv-vision/         Python 3.11 + OpenCV + MediaPipe + python-socketio
└── packages/
    └── shared/              TypeScript types, Zod schemas, Socket.IO event contracts
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 20, Yarn ≥ 1.22
- Python 3.11+
- (Optional) Ollama for offline MCQ generation

### 1. Install dependencies
```bash
yarn install
yarn build:shared
```

### 2. Configure server
```bash
cp apps/server/.env.example apps/server/.env
# Edit DATABASE_URL, JWT_SECRET, LAB_NAME
```

### 3. Set up database
```bash
yarn db:migrate
yarn db:seed
```

### 4. Start development
```bash
# Terminal 1 — API server
yarn dev:server

# Terminal 2 — Teacher desktop
yarn dev:teacher

# Terminal 3 — Student kiosk
yarn dev:student

# Terminal 4 — CCTV service (optional)
cd services/cctv-vision
pip install -r requirements.txt
cp .env.example .env
python src/main.py
```

### Default credentials (seed)
- Email: `admin@secureassess.local`
- Password: `SecureAssess@2024`

---

## Roles

| Role | Access |
|------|--------|
| **Teacher** | Exam builder, MCQ generator, roster upload, CCTV calibration, live monitor, certificates, forensic reports |
| **Student** | Exam lobby login → adaptive MCQ exam → "Submitted" screen only |

---

## Key Features

- **3-Layer Lab Firewall**: IP subnet + hardware token + mobile UA rejection
- **Anti-Adjacency Seating Engine**: Fisher-Yates shuffle with register-number adjacency constraint
- **Dual-Mode MCQ Generator**: Online (OpenAI/Groq/Gemini) + Offline (Ollama)
- **Real-Time Adaptive Engine**: EASY → MEDIUM → HARD with consecutive-correct promotion
- **OS-Level Kiosk Lockdown**: `kiosk: true`, `alwaysOnTop`, blocked shortcuts + browser fallback with identical client anti-cheat
- **Central CCTV Vision**: MediaPipe head-pose + face count, 4-corner perspective calibration, < 2s violation latency
- **Projector Mode**: Dual-pane live rankings + integrity ticker
- **PDF Exports**: Certificates with QR verification, master marksheet, forensic audit report

---

## Production Build

```bash
# Windows installers (.exe NSIS)
yarn build:teacher && yarn workspace @secureassess/teacher-desktop package:win
yarn workspace @secureassess/student-kiosk package:win

# Linux AppImage + .deb
yarn workspace @secureassess/teacher-desktop package:linux
yarn workspace @secureassess/student-kiosk package:linux
```

---

## Socket.IO Namespaces

| Namespace | Purpose |
|-----------|---------|
| `/` | Teacher + student connections, exam lifecycle, adaptive engine |
| `/cctv` | Python vision service (authenticated by shared secret) |
| `/projector` | Read-only projector broadcast (teacher JWT required) |
