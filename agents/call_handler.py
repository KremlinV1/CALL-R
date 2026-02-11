"""
Call Handler - Manages call state and integrations for the voice agent.
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Callable, Any
from loguru import logger
import httpx


class CallStatus(Enum):
    PENDING = "pending"
    RINGING = "ringing"
    CONNECTED = "connected"
    ON_HOLD = "on_hold"
    TRANSFERRING = "transferring"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class CallContext:
    """Stores context and state for an active call."""
    call_id: str
    room_name: str
    participant_id: str
    phone_number: Optional[str] = None
    status: CallStatus = CallStatus.PENDING
    started_at: datetime = field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None
    
    # Customer data (from CSV/CRM)
    customer_data: dict = field(default_factory=dict)
    
    # Call metadata
    campaign_id: Optional[str] = None
    agent_id: Optional[str] = None
    
    # Transcript
    transcript: list = field(default_factory=list)
    
    # Call outcomes
    outcome: Optional[str] = None
    disposition: Optional[str] = None
    notes: list = field(default_factory=list)
    
    def add_message(self, role: str, content: str):
        """Add a message to the transcript."""
        self.transcript.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "call_id": self.call_id,
            "room_name": self.room_name,
            "participant_id": self.participant_id,
            "phone_number": self.phone_number,
            "status": self.status.value,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "customer_data": self.customer_data,
            "campaign_id": self.campaign_id,
            "agent_id": self.agent_id,
            "transcript": self.transcript,
            "outcome": self.outcome,
            "disposition": self.disposition,
            "notes": self.notes,
            "duration_seconds": (
                (self.ended_at or datetime.now()) - self.started_at
            ).total_seconds()
        }


class CallHandler:
    """Handles call lifecycle and backend integrations."""
    
    def __init__(
        self,
        backend_url: str = "http://localhost:3001",
        api_key: Optional[str] = None
    ):
        self.backend_url = backend_url
        self.api_key = api_key
        self.active_calls: dict[str, CallContext] = {}
        self._http_client: Optional[httpx.AsyncClient] = None
    
    async def get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None:
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._http_client = httpx.AsyncClient(
                base_url=self.backend_url,
                headers=headers,
                timeout=30.0
            )
        return self._http_client
    
    async def close(self):
        """Close the HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
    
    async def start_call(
        self,
        call_id: str,
        room_name: str,
        participant_id: str,
        phone_number: Optional[str] = None,
        customer_data: Optional[dict] = None,
        campaign_id: Optional[str] = None,
        agent_id: Optional[str] = None,
    ) -> CallContext:
        """Initialize a new call context."""
        ctx = CallContext(
            call_id=call_id,
            room_name=room_name,
            participant_id=participant_id,
            phone_number=phone_number,
            customer_data=customer_data or {},
            campaign_id=campaign_id,
            agent_id=agent_id,
            status=CallStatus.CONNECTED,
        )
        self.active_calls[call_id] = ctx
        
        # Notify backend
        await self._notify_call_started(ctx)
        
        logger.info(f"Call started: {call_id}")
        return ctx
    
    async def end_call(
        self,
        call_id: str,
        outcome: Optional[str] = None,
        disposition: Optional[str] = None,
    ):
        """End a call and update its status."""
        ctx = self.active_calls.get(call_id)
        if not ctx:
            logger.warning(f"Call not found: {call_id}")
            return
        
        ctx.status = CallStatus.COMPLETED
        ctx.ended_at = datetime.now()
        ctx.outcome = outcome
        ctx.disposition = disposition
        
        # Notify backend
        await self._notify_call_ended(ctx)
        
        # Remove from active calls
        del self.active_calls[call_id]
        
        logger.info(f"Call ended: {call_id}, outcome: {outcome}")
    
    async def update_call_status(self, call_id: str, status: CallStatus):
        """Update the status of a call."""
        ctx = self.active_calls.get(call_id)
        if ctx:
            ctx.status = status
            logger.info(f"Call {call_id} status updated to: {status.value}")
    
    async def add_note(self, call_id: str, note: str):
        """Add a note to the call."""
        ctx = self.active_calls.get(call_id)
        if ctx:
            ctx.notes.append({
                "content": note,
                "timestamp": datetime.now().isoformat()
            })
    
    async def transfer_call(
        self,
        call_id: str,
        destination: str,
        transfer_type: str = "blind"
    ) -> bool:
        """Transfer the call to another destination."""
        ctx = self.active_calls.get(call_id)
        if not ctx:
            return False
        
        ctx.status = CallStatus.TRANSFERRING
        
        try:
            client = await self.get_client()
            response = await client.post(
                "/api/calls/transfer",
                json={
                    "call_id": call_id,
                    "destination": destination,
                    "transfer_type": transfer_type
                }
            )
            response.raise_for_status()
            logger.info(f"Call {call_id} transferred to {destination}")
            return True
        except Exception as e:
            logger.error(f"Failed to transfer call: {e}")
            ctx.status = CallStatus.CONNECTED
            return False
    
    async def _notify_call_started(self, ctx: CallContext):
        """Notify backend that a call has started."""
        try:
            client = await self.get_client()
            await client.post(
                "/api/calls/started",
                json=ctx.to_dict()
            )
        except Exception as e:
            logger.warning(f"Failed to notify call started: {e}")
    
    async def _notify_call_ended(self, ctx: CallContext):
        """Notify backend that a call has ended."""
        try:
            client = await self.get_client()
            await client.post(
                "/api/calls/ended",
                json=ctx.to_dict()
            )
        except Exception as e:
            logger.warning(f"Failed to notify call ended: {e}")
    
    def get_call(self, call_id: str) -> Optional[CallContext]:
        """Get a call context by ID."""
        return self.active_calls.get(call_id)
    
    def get_active_calls(self) -> list[CallContext]:
        """Get all active calls."""
        return list(self.active_calls.values())


# Background audio mixer for ambient sounds
class BackgroundAudioMixer:
    """Handles background audio mixing for the agent."""
    
    def __init__(self):
        self.enabled = False
        self.audio_type = "none"
        self.volume = 0.3
        self._audio_task: Optional[asyncio.Task] = None
    
    def configure(
        self,
        enabled: bool = False,
        audio_type: str = "none",
        volume: float = 0.3
    ):
        """Configure background audio settings."""
        self.enabled = enabled
        self.audio_type = audio_type
        self.volume = max(0.05, min(0.5, volume))  # Clamp volume
        
        logger.info(
            f"Background audio configured: enabled={enabled}, "
            f"type={audio_type}, volume={volume}"
        )
    
    async def start(self, room):
        """Start playing background audio in the room."""
        if not self.enabled or self.audio_type == "none":
            return
        
        # Audio file mapping
        audio_files = {
            "office": "audio/office-ambience.mp3",
            "cafe": "audio/cafe-ambience.mp3", 
            "callcenter": "audio/callcenter-ambience.mp3",
        }
        
        audio_file = audio_files.get(self.audio_type)
        if not audio_file:
            logger.warning(f"Unknown audio type: {self.audio_type}")
            return
        
        logger.info(f"Starting background audio: {audio_file}")
        # Note: Actual implementation would use LiveKit's audio mixing
        # This is a placeholder for the mixing logic
    
    async def stop(self):
        """Stop background audio."""
        if self._audio_task:
            self._audio_task.cancel()
            self._audio_task = None
        logger.info("Background audio stopped")
    
    def set_volume(self, volume: float):
        """Adjust background audio volume."""
        self.volume = max(0.05, min(0.5, volume))
        logger.info(f"Background audio volume set to: {self.volume}")
