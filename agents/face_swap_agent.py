"""
PON-E-LINE Face Swap Video Agent
A LiveKit agent that subscribes to a participant's video track,
performs real-time face swapping using insightface + inswapper,
and publishes the swapped video back to the room.

Architecture:
  1. Agent joins a LiveKit room
  2. Subscribes to the "source" participant's video track (the real agent/user)
  3. For each frame, swaps the face with a target face image
  4. Publishes the swapped video as its own track
  5. The original participant's video is hidden from other participants

Requires:
  - NVIDIA GPU with CUDA support
  - inswapper_128.onnx model in ./models/
  - A source face image (the face to swap TO)

Usage:
  python face_swap_agent.py start
"""

import asyncio
import os
import time
import numpy as np
import cv2
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from loguru import logger

from livekit import rtc, api
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)

load_dotenv()

# ── Configuration ──────────────────────────────────────────────────────
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

# Face swap config
SOURCE_FACE_PATH = os.getenv("FACE_SWAP_SOURCE_IMAGE", "./models/source_face.jpg")
MODEL_PATH = os.getenv("FACE_SWAP_MODEL_PATH", "./models/inswapper_128.onnx")
FACE_ENHANCER_PATH = os.getenv("FACE_ENHANCER_MODEL_PATH", "./models/GFPGANv1.4.onnx")
ENABLE_FACE_ENHANCER = os.getenv("FACE_SWAP_ENHANCE", "false").lower() == "true"
TARGET_FPS = int(os.getenv("FACE_SWAP_FPS", "24"))
OUTPUT_WIDTH = int(os.getenv("FACE_SWAP_WIDTH", "640"))
OUTPUT_HEIGHT = int(os.getenv("FACE_SWAP_HEIGHT", "480"))

# Which participant's video to process (identity prefix)
# The agent will swap the face of any participant whose identity starts with this
SOURCE_PARTICIPANT_PREFIX = os.getenv("FACE_SWAP_PARTICIPANT_PREFIX", "agent-video-")


class FaceSwapProcessor:
    """Handles face detection and swapping using insightface + inswapper ONNX model."""

    def __init__(self, model_path: str, source_face_path: str, enhancer_path: Optional[str] = None):
        self.model_path = model_path
        self.source_face_path = source_face_path
        self.enhancer_path = enhancer_path
        self.face_analyser = None
        self.face_swapper = None
        self.face_enhancer = None
        self.source_face = None
        self._initialized = False

    def initialize(self):
        """Load models. Must be called before processing frames."""
        try:
            import insightface
            from insightface.app import FaceAnalysis
            import onnxruntime as ort

            logger.info("Initializing face swap processor...")

            # Check for GPU
            providers = ort.get_available_providers()
            logger.info(f"Available ONNX providers: {providers}")

            if "CUDAExecutionProvider" in providers:
                execution_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                logger.info("Using CUDA GPU acceleration")
            elif "CoreMLExecutionProvider" in providers:
                execution_providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"]
                logger.info("Using CoreML acceleration (Apple Silicon)")
            else:
                execution_providers = ["CPUExecutionProvider"]
                logger.warning("No GPU detected — face swap will be slow!")

            # Initialize face analyser (detection + landmarks)
            self.face_analyser = FaceAnalysis(
                name="buffalo_l",
                root=str(Path(self.model_path).parent),
                providers=execution_providers,
            )
            self.face_analyser.prepare(ctx_id=0, det_size=(320, 320))
            logger.info("Face analyser loaded")

            # Load the inswapper model
            if not Path(self.model_path).exists():
                raise FileNotFoundError(
                    f"Face swap model not found at {self.model_path}. "
                    "Download inswapper_128.onnx from https://huggingface.co/deepinsight/inswapper/tree/main"
                )

            self.face_swapper = insightface.model_zoo.get_model(
                self.model_path, providers=execution_providers
            )
            logger.info("Face swapper model loaded")

            # Load source face
            if not Path(self.source_face_path).exists():
                raise FileNotFoundError(
                    f"Source face image not found at {self.source_face_path}. "
                    "Provide a clear front-facing photo of the target face."
                )

            source_img = cv2.imread(self.source_face_path)
            source_faces = self.face_analyser.get(source_img)
            if not source_faces:
                raise ValueError("No face detected in source image!")

            # Use the largest face found
            self.source_face = sorted(source_faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse=True)[0]
            logger.info("Source face loaded and analysed")

            # Optional: face enhancer (GFPGAN)
            if self.enhancer_path and Path(self.enhancer_path).exists() and ENABLE_FACE_ENHANCER:
                try:
                    self.face_enhancer = ort.InferenceSession(
                        self.enhancer_path, providers=execution_providers
                    )
                    logger.info("Face enhancer (GFPGAN) loaded")
                except Exception as e:
                    logger.warning(f"Could not load face enhancer: {e}")

            self._initialized = True
            logger.info("Face swap processor ready!")

        except ImportError as e:
            logger.error(f"Missing dependency: {e}")
            logger.error("Install: pip install insightface onnxruntime-gpu opencv-python-headless")
            raise

    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """Swap faces in a single video frame.

        Args:
            frame: BGR numpy array (OpenCV format)

        Returns:
            Processed frame with faces swapped
        """
        if not self._initialized:
            return frame

        try:
            # Detect faces in the frame
            faces = self.face_analyser.get(frame)

            if not faces:
                return frame

            # Swap each detected face with the source face
            result = frame.copy()
            for face in faces:
                result = self.face_swapper.get(result, face, self.source_face, paste_back=True)

            return result

        except Exception as e:
            logger.error(f"Frame processing error: {e}")
            return frame


class FaceSwapVideoAgent:
    """LiveKit agent that processes video tracks with face swapping."""

    def __init__(self, processor: FaceSwapProcessor):
        self.processor = processor
        self.video_source: Optional[rtc.VideoSource] = None
        self.processing = False
        self._frame_count = 0
        self._start_time = 0.0

    async def start(self, ctx: JobContext):
        """Main entry point — called when the agent joins a room."""
        logger.info(f"Face swap agent joining room: {ctx.room.name}")

        # Initialize the face swap processor (loads models)
        self.processor.initialize()

        # Create a video source to publish processed frames
        self.video_source = rtc.VideoSource(OUTPUT_WIDTH, OUTPUT_HEIGHT)
        video_track = rtc.LocalVideoTrack.create_video_track("face_swap_video", self.video_source)

        # Publish the processed video track
        publish_options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_CAMERA)
        await ctx.room.local_participant.publish_track(video_track, publish_options)
        logger.info("Published face-swapped video track")

        # Listen for participant tracks
        ctx.room.on("track_subscribed", self._on_track_subscribed)

        # Also check existing participants
        for participant in ctx.room.remote_participants.values():
            for track_pub in participant.track_publications.values():
                if track_pub.track and track_pub.kind == rtc.TrackKind.KIND_VIDEO:
                    if self._should_process_participant(participant.identity):
                        logger.info(f"Found existing video track from {participant.identity}")
                        asyncio.create_task(
                            self._process_video_track(track_pub.track, participant.identity)
                        )

    def _should_process_participant(self, identity: str) -> bool:
        """Check if we should process this participant's video."""
        # Process any participant that matches the prefix, or if no prefix is set, process all
        if not SOURCE_PARTICIPANT_PREFIX:
            return True
        return identity.startswith(SOURCE_PARTICIPANT_PREFIX)

    def _on_track_subscribed(
        self,
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        """Called when a new track is subscribed."""
        if track.kind != rtc.TrackKind.KIND_VIDEO:
            return

        if not self._should_process_participant(participant.identity):
            logger.info(f"Skipping video from {participant.identity} (not target)")
            return

        logger.info(f"Processing video from participant: {participant.identity}")
        asyncio.create_task(self._process_video_track(track, participant.identity))

    async def _process_video_track(self, track: rtc.Track, identity: str):
        """Process incoming video frames and publish swapped versions."""
        if self.processing:
            logger.warning("Already processing a video track, skipping")
            return

        self.processing = True
        self._frame_count = 0
        self._start_time = time.time()

        video_stream = rtc.VideoStream(track)
        frame_interval = 1.0 / TARGET_FPS
        last_frame_time = 0.0

        logger.info(f"Starting face swap processing at {TARGET_FPS} FPS for {identity}")

        try:
            async for event in video_stream:
                current_time = time.time()

                # Frame rate limiting
                if current_time - last_frame_time < frame_interval:
                    continue
                last_frame_time = current_time

                # Convert LiveKit frame to numpy array (BGR for OpenCV)
                frame = event.frame
                argb_frame = frame.convert(rtc.VideoBufferType.ARGB)
                arr = np.frombuffer(argb_frame.data, dtype=np.uint8)
                arr = arr.reshape((argb_frame.height, argb_frame.width, 4))

                # ARGB → BGR for OpenCV
                bgr = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)

                # Resize if needed
                if bgr.shape[1] != OUTPUT_WIDTH or bgr.shape[0] != OUTPUT_HEIGHT:
                    bgr = cv2.resize(bgr, (OUTPUT_WIDTH, OUTPUT_HEIGHT))

                # Run face swap
                processed = await asyncio.get_event_loop().run_in_executor(
                    None, self.processor.process_frame, bgr
                )

                # Convert back to ARGB for LiveKit
                rgba = cv2.cvtColor(processed, cv2.COLOR_BGR2RGBA)

                # Create and send the output frame
                out_frame = rtc.VideoFrame(
                    OUTPUT_WIDTH,
                    OUTPUT_HEIGHT,
                    rtc.VideoBufferType.ARGB,
                    rgba.tobytes(),
                )
                self.video_source.capture_frame(out_frame)

                self._frame_count += 1
                if self._frame_count % 100 == 0:
                    elapsed = time.time() - self._start_time
                    actual_fps = self._frame_count / elapsed if elapsed > 0 else 0
                    logger.info(f"Processed {self._frame_count} frames, actual FPS: {actual_fps:.1f}")

        except Exception as e:
            logger.error(f"Video processing error: {e}")
        finally:
            self.processing = False
            logger.info(f"Stopped processing video from {identity}")


# ── LiveKit Agent Entry Point ──────────────────────────────────────────

def prewarm(proc: JobProcess):
    """Pre-warm: load models before accepting jobs."""
    logger.info("Pre-warming face swap models...")
    proc.userdata["processor"] = FaceSwapProcessor(
        model_path=MODEL_PATH,
        source_face_path=SOURCE_FACE_PATH,
        enhancer_path=FACE_ENHANCER_PATH if ENABLE_FACE_ENHANCER else None,
    )
    proc.userdata["processor"].initialize()
    logger.info("Face swap models pre-warmed and ready")


async def entrypoint(ctx: JobContext):
    """Called when the agent is dispatched to a room."""
    logger.info(f"Face swap agent dispatched to room: {ctx.room.name}")

    await ctx.connect(auto_subscribe=AutoSubscribe.VIDEO_ONLY)

    # Use pre-warmed processor or create new one
    processor = ctx.proc.userdata.get("processor")
    if not processor:
        processor = FaceSwapProcessor(
            model_path=MODEL_PATH,
            source_face_path=SOURCE_FACE_PATH,
            enhancer_path=FACE_ENHANCER_PATH if ENABLE_FACE_ENHANCER else None,
        )
        processor.initialize()

    agent = FaceSwapVideoAgent(processor)
    await agent.start(ctx)

    # Keep alive while the room exists
    while ctx.room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
        await asyncio.sleep(1)

    logger.info("Room disconnected, face swap agent shutting down")


if __name__ == "__main__":
    logger.info("Starting PON-E-LINE Face Swap Video Agent")
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="face-swap-agent",
        )
    )
