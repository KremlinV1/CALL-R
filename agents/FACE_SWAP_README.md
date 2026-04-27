# Face Swap Video Agent

Real-time face swapping for video calls using LiveKit + insightface + inswapper.

## How It Works

1. An agent (or dashboard user) starts a video call and joins a LiveKit room with their camera
2. The Face Swap Agent joins the same room
3. It subscribes to the video track, processes each frame through the face swap pipeline
4. Publishes a new video track with the swapped face
5. The customer only sees the swapped face

## Requirements

- **NVIDIA GPU** with CUDA support (RTX 3060+ recommended for real-time)
- **Python 3.10+**
- **CUDA 12.x** + cuDNN 8
- ~2GB VRAM for face swap model

## Quick Start

### 1. Install Dependencies

```bash
pip install -r face_swap_requirements.txt
```

> For CPU-only (slow, ~2-5 FPS): replace `onnxruntime-gpu` with `onnxruntime` in requirements.

### 2. Download Models

```bash
chmod +x download_models.sh
./download_models.sh
```

You need:
- `models/inswapper_128.onnx` — from [HuggingFace](https://huggingface.co/deepinsight/inswapper/tree/main)
- `models/source_face.jpg` — a clear front-facing photo of the face you want to display
- `models/GFPGANv1.4.onnx` (optional) — face enhancement

### 3. Configure Environment

Add to your `.env`:

```env
# LiveKit credentials (same as voice agent)
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Face swap settings
FACE_SWAP_SOURCE_IMAGE=./models/source_face.jpg
FACE_SWAP_MODEL_PATH=./models/inswapper_128.onnx
FACE_SWAP_FPS=24
FACE_SWAP_WIDTH=640
FACE_SWAP_HEIGHT=480
FACE_SWAP_ENHANCE=false
FACE_SWAP_PARTICIPANT_PREFIX=agent-video-
```

### 4. Run

```bash
python face_swap_agent.py start
```

## Docker (GPU)

```bash
# Build
docker build -f Dockerfile.faceswap -t poneline-face-swap .

# Run (requires nvidia-container-toolkit)
docker run --gpus all \
  --env-file .env \
  -v ./models:/app/models \
  poneline-face-swap
```

## Architecture

```
Dashboard User (camera) ──→ LiveKit Room
                                │
Face Swap Agent subscribes ─────┘
        │
        ▼
  insightface (detect) → inswapper (swap) → GFPGAN (enhance, optional)
        │
        ▼
  Publishes swapped video track ──→ LiveKit Room ──→ Customer sees swapped face
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `FACE_SWAP_SOURCE_IMAGE` | `./models/source_face.jpg` | The face to swap TO |
| `FACE_SWAP_MODEL_PATH` | `./models/inswapper_128.onnx` | inswapper ONNX model |
| `FACE_SWAP_FPS` | `24` | Target processing framerate |
| `FACE_SWAP_WIDTH` | `640` | Output video width |
| `FACE_SWAP_HEIGHT` | `480` | Output video height |
| `FACE_SWAP_ENHANCE` | `false` | Enable GFPGAN face enhancement |
| `FACE_SWAP_PARTICIPANT_PREFIX` | `agent-video-` | Process video from participants with this identity prefix |

## Performance

| Hardware | Expected FPS |
|---|---|
| RTX 4090 | 30+ FPS |
| RTX 3080 | 24-30 FPS |
| RTX 3060 | 15-24 FPS |
| CPU only | 2-5 FPS |

## GPU Hosting Options

- **RunPod** — GPU containers on demand ($0.40/hr for RTX 3090)
- **Vast.ai** — Cheapest GPU rentals
- **Lambda Labs** — GPU cloud instances
- **AWS g4dn** — NVIDIA T4 instances
- **GCP** — NVIDIA L4/T4 instances

## Changing the Face

Just replace `models/source_face.jpg` with a new image and restart the agent. Use a well-lit, front-facing photo for best results.
