# AI-Based Multimodal Learning, Question Generation & Answer Evaluation Platform

An end-to-end EdTech research platform:

**Learning Material → Content Processing → AI Question Generation → Teacher Validation → Student Response (Text / Voice / Handwritten) → AI Evaluation → Human Evaluation → AI vs Human Comparison → Research Analytics**

---

## ✨ Features

| Area | What works |
|---|---|
| Auth | Sign in, Sign up, OTP verification, Forgot password, Reset password, role-based dashboards |
| OTP | 4 flows: sign-in OTP, sign-up OTP, forgot-password OTP, **forced OTP after 3 wrong passwords** (server-side lock) |
| Materials | Upload PDF / notes / images / video, drag & drop, processing status |
| Processing | PDF text extraction, notes parsing, OCR demo fallback, video transcript fallback |
| AI | Question generation, answer evaluation, feedback, content analysis — with **mock fallback when no API key** |
| Teacher | Approve / Edit / Reject AI questions, evaluate student responses independently |
| Student | Text answers, voice answers (STT), handwritten answers (OCR), results & analytics |
| Comparison | AI vs Teacher score diff, agreement %, charts |
| Analytics | Overview, topic/difficulty performance, score distribution, research insights |
| Admin | Users, system dashboard, research analytics |

---

## 🛠 Tech Stack

- **Frontend:** React 18 + Vite + React Router + Recharts (custom dark/light CSS design system)
- **Backend:** Node.js + Express
- **Database:** SQLite via Node's built-in `node:sqlite` — **zero native compilation, zero configuration**
- **Auth:** JWT + bcryptjs
- **AI:** Pluggable service (OpenAI if `OPENAI_API_KEY` is set, otherwise deterministic demo engine)

> Requires **Node.js >= 22.5** (for `node:sqlite`). No Visual Studio / C++ build tools needed.

---

## 🚀 Installation

```bash
node generator.js
```

That single command:
1. creates the folder structure
2. writes all source files
3. installs dependencies (backend + frontend)
4. creates the SQLite database & schema
5. seeds demo data
6. configures auth, OTP and AI services
7. starts the application

Manual start (after generation):

```bash
node scripts/start-all.js
```

- Frontend → http://localhost:5173
- Backend  → http://localhost:5000

---

## 🔑 Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.com | Admin@123 |
| Teacher | teacher@demo.com | Teacher@123 |
| Student | student@demo.com | Student@123 |
| Student | aarav@demo.com | Student@123 |
| Student | diya@demo.com | Student@123 |
| Student | kabir@demo.com | Student@123 |

---

## 📱 Demo OTP Instructions

The app runs in **DEMO OTP MODE** by default (`OTP_DEMO_MODE=true`).

- The generated OTP is printed in the **backend console**:
  ```
  DEMO OTP [login] for teacher@demo.com: 483921
  ```
- It is also returned by the API and shown in a yellow **DEMO MODE** panel on the OTP screen.

Try these OTP flows:
1. **Sign up** — create a new account, verify with OTP.
2. **Sign in with OTP** — click "Sign in with OTP" on the login page.
3. **Forgot password** — request OTP, verify, set a new password.
4. **3 wrong passwords** — enter a wrong password 3 times → the account is locked server-side and OTP verification is required.

---

## ⚙️ Environment Variables

Copy `.env.example` → `backend/.env` (the generator already does this).

| Variable | Purpose |
|---|---|
| `PORT` | Backend port (default 5000) |
| `JWT_SECRET` | JWT signing secret |
| `DB_PATH` | SQLite file path |
| `OTP_DEMO_MODE` | `true` = return OTP in API response |
| `OPENAI_API_KEY` | Optional — enables real AI |
| `VITE_API_URL` | Frontend → backend base URL |

---

## 🤖 AI API Configuration

`backend/src/services/aiService.js` exposes:

- `generateQuestions(content, count, topic)`
- `evaluateAnswer(question, expectedAnswer, studentAnswer, answerType)`
- `generateFeedback(...)`
- `analyzeContent(text)`

If `OPENAI_API_KEY` is set, real API calls are attempted first.
If it is missing **or the call fails**, the deterministic demo engine produces
realistic structured JSON so the demo never breaks.

---

## 🎬 Hackathon Demo Flow

1. Login as **Teacher** (`teacher@demo.com`)
2. **Materials** → Upload a learning material
3. Click **Process** → extracted content appears
4. Click **Generate Questions** → AI produces questions with expected answers, topic, difficulty, learning objective
5. **Approve / Edit / Reject** a question in the review panel
6. Logout → Login as **Student** (`student@demo.com`)
7. **Assessments** → open the assessment → answer with **Text / Voice / Handwritten**
8. Submit → **AI evaluation** appears instantly (score, correctness, coverage, grammar, feedback)
9. Logout → Login as **Teacher** → **Responses** → **Evaluate** the same response manually
10. Open **AI vs Human Comparison** → charts of score difference & agreement
11. Login as **Admin** → **Research Analytics** → platform-wide insights

---

## 📁 Project Structure

```
project/
├── generator.js
├── package.json
├── scripts/start-all.js
├── README.md
├── .env.example
├── backend/
│   ├── package.json
│   ├── .env
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── seed.js
│       ├── middleware/auth.js
│       ├── services/{aiService,otpService,contentService}.js
│       └── routes/{auth,api}.js
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx  App.jsx  api.js  styles.css
        ├── context/AuthContext.jsx
        ├── components/{ui,Layout}.jsx
        └── pages/{auth,student,teacher,admin}.jsx
```

---

Built for hackathon speed: **no paid APIs, no cloud setup, no native builds, no empty placeholders.**
