# 🚀 Pon E Line

**Enterprise Voice AI Platform** - Build, deploy, and manage AI voice agents for phone calls.

Built on LiveKit Agents framework with best features from Retell AI, Vapi, and Bland AI.

## ✨ Features

- 🤖 **AI Voice Agents** - Create custom agents with configurable voice, LLM, and actions
- 📞 **Batch Calling** - Run campaigns with 10K+ contacts
- 📊 **Real-time Analytics** - Track calls, outcomes, and sentiment
- 👥 **Contact Management** - Upload, segment, and manage leads
- 🎯 **Campaign Management** - Schedule and monitor batch campaigns
- 📝 **Call Recording & Transcription** - Automatic recording and AI transcription
- 🔄 **Call Transfer** - Warm and cold transfer capabilities
- 📬 **Voicemail Detection** - Automatic AMD with customizable actions

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn/UI
- **Animations:** Framer Motion
- **State Management:** Zustand
- **Data Fetching:** TanStack Query

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** PostgreSQL (Drizzle ORM)
- **Caching:** Redis
- **Real-time:** Socket.IO
- **Auth:** JWT (jose)

### Voice AI
- **Framework:** LiveKit Agents
- **STT:** Deepgram, AssemblyAI, Google
- **LLM:** OpenAI, Anthropic, Google
- **TTS:** Cartesia, ElevenLabs, OpenAI
- **Telephony:** Twilio, Telnyx, Vonage

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   cd pon-e-line
   ```

2. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd ../backend
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Start the development servers**

   In one terminal (backend):
   ```bash
   cd backend
   npm run dev
   ```

   In another terminal (frontend):
   ```bash
   cd frontend
   npm run dev
   ```

6. **Open the app**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000
   - API Health Check: http://localhost:4000/health

## 📁 Project Structure

```
pon-e-line/
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── app/            # App router pages
│   │   │   ├── (auth)/     # Auth pages (login, signup)
│   │   │   └── (dashboard)/ # Dashboard pages
│   │   ├── components/     # React components
│   │   │   ├── ui/        # Shadcn/UI components
│   │   │   └── layout/    # Layout components
│   │   ├── lib/           # Utilities
│   │   └── types/         # TypeScript types
│   └── package.json
│
├── backend/                # Express.js backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Express middleware
│   │   ├── db/            # Database schema & queries
│   │   ├── services/      # Business logic
│   │   └── types/         # TypeScript types
│   └── package.json
│
├── agents/                 # LiveKit Agents (Python)
│   └── (coming soon)
│
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Agents
- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:id` - Get agent
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/start` - Start campaign
- `POST /api/campaigns/:id/pause` - Pause campaign

### Contacts
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact
- `POST /api/contacts/bulk` - Bulk import contacts

### Calls
- `GET /api/calls` - List calls
- `POST /api/calls/outbound` - Initiate call
- `GET /api/calls/:id/transcript` - Get transcript

### Analytics
- `GET /api/analytics/dashboard` - Dashboard stats
- `GET /api/analytics/call-volume` - Call volume data
- `GET /api/analytics/outcomes` - Call outcomes
- `GET /api/analytics/sentiment` - Sentiment analysis

## 🧪 Testing

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines.

---

Built with ❤️ by the Pon E Line team
