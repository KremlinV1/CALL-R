# PON-E-LINE Voice Agent (Python)

A Python-based voice agent runtime using the [LiveKit Agents](https://docs.livekit.io/agents/) framework for real-time voice AI interactions.

## Features

- **Real-time Voice AI** - Uses LiveKit for ultra-low latency voice interactions
- **Multiple TTS Providers** - Cartesia, ElevenLabs, OpenAI TTS
- **Multiple STT Providers** - Deepgram, OpenAI Whisper
- **LLM Integration** - OpenAI GPT-4o-mini for conversational AI
- **Variable Interpolation** - Dynamic `{{first_name}}`, `{{company}}` placeholders
- **Background Audio** - Office, café, call center ambient sounds
- **Call Management** - Transfer, hold, end call functions
- **Transcript Logging** - Full conversation transcripts

## Quick Start

### 1. Install Dependencies

```bash
cd agents
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Start LiveKit Server (Development)

```bash
# Install LiveKit CLI: https://docs.livekit.io/home/cli/cli-setup/
livekit-server --dev
```

### 4. Run the Agent

```bash
python agent.py dev
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LIVEKIT_URL` | LiveKit server WebSocket URL | Yes |
| `LIVEKIT_API_KEY` | LiveKit API key | Yes |
| `LIVEKIT_API_SECRET` | LiveKit API secret | Yes |
| `OPENAI_API_KEY` | OpenAI API key for LLM | Yes |
| `CARTESIA_API_KEY` | Cartesia API key for TTS | No |
| `DEEPGRAM_API_KEY` | Deepgram API key for STT | No |

### Agent Configuration

Pass configuration via room metadata when creating a call:

```json
{
  "agent_name": "Sarah",
  "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",
  "system_prompt": "You are a helpful assistant...",
  "opening_message": "Hi {{first_name}}, how can I help?",
  "temperature": 0.7,
  "variables": {
    "first_name": "John",
    "company_name": "Acme Corp"
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PON-E-LINE Agent                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Deepgram  │    │   OpenAI    │    │   Cartesia  │     │
│  │    (STT)    │───▶│    (LLM)    │───▶│    (TTS)    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         ▲                                      │            │
│         │                                      ▼            │
│  ┌──────┴──────────────────────────────────────────┐       │
│  │              LiveKit Voice Pipeline              │       │
│  │    (VAD, Turn Detection, Interruption)          │       │
│  └──────────────────────────────────────────────────┘       │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │                 LiveKit Room                      │       │
│  │         (WebRTC, Real-time Audio)                │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Available Agent Functions

The agent can perform these actions during a call:

| Function | Description |
|----------|-------------|
| `transfer_call` | Transfer to human agent |
| `book_appointment` | Schedule an appointment |
| `send_sms` | Send text message |
| `end_call` | End the conversation |
| `lookup_account` | Look up customer account |

## File Structure

```
agents/
├── agent.py           # Main agent entry point
├── call_handler.py    # Call state management
├── requirements.txt   # Python dependencies
├── .env.example       # Environment template
└── README.md          # This file
```

## Development

### Testing Locally

1. Start LiveKit server in dev mode
2. Run the agent: `python agent.py dev`
3. Use LiveKit CLI to create a test room and join as a participant

```bash
# Create a token for testing
lk token create --api-key <key> --api-secret <secret> \
  --join --room test-room --identity test-user

# Join with the token using the LiveKit Meet app or CLI
```

### Debugging

Enable verbose logging:

```bash
LIVEKIT_LOG_LEVEL=debug python agent.py dev
```

## Production Deployment

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "agent.py", "start"]
```

### Scaling

LiveKit Agents supports horizontal scaling. Run multiple agent instances:

```bash
# Worker 1
python agent.py start --worker-id worker-1

# Worker 2
python agent.py start --worker-id worker-2
```

## Integration with PON-E-LINE Backend

The agent integrates with the Node.js backend via:

1. **Room Metadata** - Agent config passed when creating LiveKit rooms
2. **Webhooks** - Call events sent to backend endpoints
3. **API Calls** - Agent can call backend for CRM data, transfers, etc.

## License

MIT
