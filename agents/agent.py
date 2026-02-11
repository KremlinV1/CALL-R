"""
PON-E-LINE LiveKit Voice Agent
A Python-based voice agent runtime using LiveKit Agents framework.
"""

import asyncio
import json
import os
import httpx
from datetime import datetime
from typing import Optional, List, Dict
from dotenv import load_dotenv
from loguru import logger

from livekit import api
from livekit.protocol.sip import TransferSIPParticipantRequest
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    RoomInputOptions,
    WorkerOptions,
    cli,
    function_tool,
    RunContext,
)
from livekit.agents.voice import ModelSettings
from livekit.plugins import openai, silero, cartesia, deepgram

load_dotenv()

# Backend API configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000")
BACKEND_API_TOKEN = os.getenv("BACKEND_API_TOKEN", "")

# Agent configuration from environment
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")


class TransferDestination:
    """Configuration for a transfer destination."""
    
    def __init__(self, id: str, name: str, phone_number: str, description: str = ""):
        self.id = id
        self.name = name
        self.phone_number = phone_number
        self.description = description


class AgentConfig:
    """Configuration for the voice agent."""
    
    def __init__(
        self,
        name: str = "Sarah",
        voice_id: str = "a0e99841-438c-4a64-b679-ae501e7d6091",
        system_prompt: str = "",
        opening_message: str = "",
        temperature: float = 0.7,
        variables: dict = None,
        transfer_destinations: List[Dict] = None,
        default_transfer_destination: str = "support",
    ):
        self.name = name
        self.voice_id = voice_id
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.opening_message = opening_message or self._default_opening()
        self.temperature = temperature
        self.variables = variables or {}
        self.transfer_destinations = self._parse_transfer_destinations(transfer_destinations)
        self.default_transfer_destination = default_transfer_destination
    
    def _parse_transfer_destinations(self, destinations: List[Dict] = None) -> Dict[str, TransferDestination]:
        """Parse transfer destinations from config."""
        if not destinations:
            # Default destinations
            return {
                "support": TransferDestination("support", "Support", "", "Customer support team"),
                "sales": TransferDestination("sales", "Sales", "", "Sales department"),
                "billing": TransferDestination("billing", "Billing", "", "Billing inquiries"),
            }
        
        result = {}
        for dest in destinations:
            result[dest.get("id", dest.get("name", "").lower())] = TransferDestination(
                id=dest.get("id", ""),
                name=dest.get("name", ""),
                phone_number=dest.get("phoneNumber", dest.get("phone_number", "")),
                description=dest.get("description", "")
            )
        return result
    
    def get_transfer_phone(self, department: str) -> Optional[str]:
        """Get phone number for a department."""
        dest = self.transfer_destinations.get(department.lower())
        if dest and dest.phone_number:
            return dest.phone_number
        # Try default
        default_dest = self.transfer_destinations.get(self.default_transfer_destination)
        if default_dest and default_dest.phone_number:
            return default_dest.phone_number
        return None
    
    def get_available_departments(self) -> List[str]:
        """Get list of available departments for transfer."""
        return [dest.name for dest in self.transfer_destinations.values() if dest.phone_number]
    
    def _default_system_prompt(self) -> str:
        return """You are Sarah, a friendly and professional AI voice assistant for PON-E-LINE.
Your role is to help customers with their inquiries in a warm, conversational manner.

Guidelines:
- Be concise but helpful - keep responses under 2-3 sentences when possible
- Use natural, conversational language
- If you don't know something, be honest about it
- Always maintain a positive, helpful tone
- Listen actively and respond to what the customer actually said
- If the customer wants to speak to a human, offer to transfer them

Remember: You're having a phone conversation, so speak naturally as if talking to someone."""

    def _default_opening(self) -> str:
        return "Hi there! This is Sarah from PON-E-LINE. How can I help you today?"
    
    def interpolate_variables(self, text: str) -> str:
        """Replace {{variable}} placeholders with actual values."""
        result = text
        for key, value in self.variables.items():
            placeholder = f"{{{{{key}}}}}"
            result = result.replace(placeholder, str(value))
        return result


def create_agent_config_from_metadata(metadata: dict) -> AgentConfig:
    """Create agent config from room metadata (passed from backend)."""
    # Parse transfer config
    transfer_config = metadata.get("transferConfig", metadata.get("transfer_config", {}))
    transfer_destinations = transfer_config.get("destinations", [])
    default_transfer = transfer_config.get("defaultDestination", transfer_config.get("default_destination", "support"))
    
    return AgentConfig(
        name=metadata.get("agent_name", "Sarah"),
        voice_id=metadata.get("voice_id", "a0e99841-438c-4a64-b679-ae501e7d6091"),
        system_prompt=metadata.get("system_prompt", ""),
        opening_message=metadata.get("opening_message", ""),
        temperature=metadata.get("temperature", 0.7),
        variables=metadata.get("variables", {}),
        transfer_destinations=transfer_destinations,
        default_transfer_destination=default_transfer,
    )


class PONELineAgent(Agent):
    """PON-E-LINE Voice Agent using the new Agent class."""
    
    def __init__(self, config: AgentConfig = None, room_name: str = None, participant_identity: str = None):
        self.config = config or AgentConfig()
        self.room_name = room_name
        self.participant_identity = participant_identity
        self._livekit_api = None
        
        # Initialize components
        # Use OpenAI for STT if Deepgram not configured
        if DEEPGRAM_API_KEY and DEEPGRAM_API_KEY != "your_deepgram_key":
            stt = deepgram.STT(model="nova-2", language="en")
        else:
            stt = openai.STT()
        
        # Use Cartesia for TTS if configured, else OpenAI
        if CARTESIA_API_KEY and CARTESIA_API_KEY != "your_cartesia_key":
            tts = cartesia.TTS(voice=self.config.voice_id)
        else:
            tts = openai.TTS(voice="alloy")
        
        super().__init__(
            instructions=self.config.system_prompt,
            stt=stt,
            llm=openai.LLM(model="gpt-4o-mini"),
            tts=tts,
            vad=silero.VAD.load(),
        )
    
    def set_room_context(self, room_name: str, participant_identity: str):
        """Set room context for transfer operations."""
        self.room_name = room_name
        self.participant_identity = participant_identity
    
    async def on_enter(self):
        """Called when the agent starts."""
        # Say the opening message
        opening = self.config.interpolate_variables(self.config.opening_message)
        await self.session.say(opening)
    
    @function_tool
    async def transfer_call(self, department: str = "support") -> str:
        """Transfer the call to a human agent or specific department.
        
        Use this when the customer asks to speak with a human, wants to be transferred,
        or when their issue requires human assistance.
        
        Args:
            department: The department to transfer to. Available options depend on configuration.
                       Common values: support, sales, billing
        """
        logger.info(f"Transfer requested to: {department}")
        
        # Get the phone number for this department
        transfer_to = self.config.get_transfer_phone(department)
        
        if not transfer_to:
            available = self.config.get_available_departments()
            if available:
                return f"I'm sorry, I don't have a transfer number for {department}. I can transfer you to: {', '.join(available)}. Which would you prefer?"
            else:
                return "I'm sorry, call transfers are not currently configured. Is there anything else I can help you with?"
        
        # Format phone number for SIP
        if not transfer_to.startswith("tel:") and not transfer_to.startswith("sip:"):
            # Clean the phone number and format it
            clean_number = ''.join(filter(str.isdigit, transfer_to))
            if not clean_number.startswith('1') and len(clean_number) == 10:
                clean_number = '1' + clean_number
            transfer_to = f"tel:+{clean_number}"
        
        logger.info(f"Initiating SIP transfer to: {transfer_to}")
        
        # Perform the actual SIP transfer
        if self.room_name and self.participant_identity:
            try:
                async with api.LiveKitAPI() as livekit_api:
                    transfer_request = TransferSIPParticipantRequest(
                        participant_identity=self.participant_identity,
                        room_name=self.room_name,
                        transfer_to=transfer_to,
                        play_dialtone=False
                    )
                    
                    await livekit_api.sip.transfer_sip_participant(transfer_request)
                    logger.info(f"SIP transfer successful to {transfer_to}")
                    
            except Exception as e:
                logger.error(f"SIP transfer failed: {e}")
                return f"I apologize, but I'm having trouble connecting you to {department}. Let me try again or provide you with their direct number."
        else:
            logger.warning("Room context not set, cannot perform SIP transfer")
            return f"I'll connect you to our {department} team. Please hold while I transfer your call."
        
        return f"I'm transferring you to our {department} team now. Thank you for calling, and have a great day!"
    
    @function_tool
    async def book_appointment(self, date: str, time: str, service: str = "consultation") -> str:
        """Book an appointment for the customer.
        
        Args:
            date: The date for the appointment (e.g., "2024-01-15")
            time: The time for the appointment (e.g., "2:00 PM")
            service: Type of service/appointment
        """
        logger.info(f"Booking appointment: {service} on {date} at {time}")
        return f"I've scheduled your {service} appointment for {date} at {time}. You'll receive a confirmation shortly."
    
    @function_tool
    async def send_sms(self, message: str) -> str:
        """Send an SMS to the customer's phone.
        
        Args:
            message: The message content to send
        """
        logger.info(f"Sending SMS: {message}")
        return "I've sent that information to your phone via text message."
    
    @function_tool
    async def end_call(self, reason: str = "completed") -> str:
        """End the current call.
        
        Args:
            reason: The reason for ending the call
        """
        logger.info(f"Ending call: {reason}")
        return "Thank you for calling PON-E-LINE. Have a great day! Goodbye."
    
    @function_tool
    async def lookup_account(self, phone_number: str) -> str:
        """Look up a customer's account by phone number.
        
        Args:
            phone_number: Customer's phone number
        """
        logger.info(f"Looking up account: {phone_number}")
        return "I found your account. How can I help you today?"


async def send_call_status(
    room_name: str,
    status: str = None,
    transcript: str = None,
    recording_url: str = None,
    summary: str = None,
    sentiment: str = None,
    outcome: str = None,
):
    """Send call status update to backend API."""
    try:
        async with httpx.AsyncClient() as client:
            payload = {"roomName": room_name}
            if status:
                payload["status"] = status
            if transcript:
                payload["transcript"] = transcript
            if recording_url:
                payload["recordingUrl"] = recording_url
            if summary:
                payload["summary"] = summary
            if sentiment:
                payload["sentiment"] = sentiment
            if outcome:
                payload["outcome"] = outcome
            
            response = await client.post(
                f"{BACKEND_URL}/api/calls/webhook/status",
                json=payload,
                headers={"Authorization": f"Bearer {BACKEND_API_TOKEN}"},
                timeout=10.0
            )
            
            if response.status_code == 200:
                logger.info(f"Call status updated: {status or 'data'}")
            else:
                logger.warning(f"Failed to update call status: {response.status_code}")
    except Exception as e:
        logger.error(f"Error sending call status: {e}")


async def generate_call_summary(transcript: str) -> Dict:
    """Generate AI summary of the call using OpenAI."""
    try:
        if not transcript or len(transcript) < 50:
            return {"summary": "Call too short for analysis", "sentiment": "neutral", "outcome": "unknown"}
        
        llm = openai.LLM(model="gpt-4o-mini")
        
        prompt = f"""Analyze this call transcript and provide:
1. A brief 2-3 sentence summary
2. Overall sentiment (positive, neutral, negative)
3. Call outcome (successful, unsuccessful, transferred, voicemail, callback_scheduled)

Transcript:
{transcript[:3000]}

Respond in JSON format:
{{"summary": "...", "sentiment": "...", "outcome": "..."}}"""
        
        response = await llm.chat(
            messages=[{"role": "user", "content": prompt}]
        )
        
        result = json.loads(response.content)
        return result
    except Exception as e:
        logger.error(f"Error generating call summary: {e}")
        return {"summary": "Analysis failed", "sentiment": "neutral", "outcome": "unknown"}


async def entrypoint(ctx: JobContext):
    """Main entry point for the voice agent."""
    logger.info(f"Agent joining room: {ctx.room.name}")
    
    # Track conversation for transcript
    conversation_history = []
    
    # Get agent configuration from room metadata or use defaults
    config = AgentConfig()
    call_id = None
    
    if ctx.room.metadata:
        try:
            metadata = json.loads(ctx.room.metadata)
            config = create_agent_config_from_metadata(metadata)
            call_id = metadata.get("callId")
            logger.info(f"Loaded agent config: {config.name}, callId: {call_id}")
        except Exception as e:
            logger.warning(f"Failed to parse room metadata: {e}, using defaults")
    
    # Notify backend that call is in-progress
    await send_call_status(ctx.room.name, status="in-progress")
    
    # Connect to the room
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    
    # Get participant identity for SIP transfers
    # Wait for a remote participant (the caller) to join
    participant_identity = None
    for participant in ctx.room.remote_participants.values():
        # Look for SIP participants (callers)
        if participant.identity and not participant.identity.startswith("agent"):
            participant_identity = participant.identity
            logger.info(f"Found caller participant: {participant_identity}")
            break
    
    # Create and start the agent with room context
    agent = PONELineAgent(
        config=config,
        room_name=ctx.room.name,
        participant_identity=participant_identity
    )
    
    # Listen for new participants to update context
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant):
        nonlocal participant_identity
        if not participant.identity.startswith("agent"):
            participant_identity = participant.identity
            agent.set_room_context(ctx.room.name, participant_identity)
            logger.info(f"Updated participant context: {participant_identity}")
    
    session = AgentSession()
    
    # Track transcription for call history
    @session.on("user_input_transcribed")
    def on_user_input(text: str):
        conversation_history.append({"role": "user", "content": text, "timestamp": datetime.now().isoformat()})
        logger.debug(f"User said: {text}")
    
    @session.on("agent_speech")
    def on_agent_speech(text: str):
        conversation_history.append({"role": "assistant", "content": text, "timestamp": datetime.now().isoformat()})
        logger.debug(f"Agent said: {text}")
    
    await session.start(agent=agent, room=ctx.room)
    
    logger.info("Agent is now active and listening")
    
    # Cleanup callback when session ends
    async def on_session_end():
        logger.info(f"Session ending for room: {ctx.room.name}")
        
        # Build transcript
        transcript_lines = []
        for entry in conversation_history:
            role = "Customer" if entry["role"] == "user" else "Agent"
            transcript_lines.append(f"{role}: {entry['content']}")
        
        full_transcript = "\n".join(transcript_lines)
        
        # Generate AI summary
        analysis = await generate_call_summary(full_transcript)
        
        # Send final status to backend
        await send_call_status(
            room_name=ctx.room.name,
            status="completed",
            transcript=full_transcript,
            summary=analysis.get("summary"),
            sentiment=analysis.get("sentiment"),
            outcome=analysis.get("outcome"),
        )
        
        logger.info(f"Call completed. Transcript length: {len(full_transcript)} chars")
    
    ctx.add_shutdown_callback(on_session_end)


if __name__ == "__main__":
    logger.info("Starting PON-E-LINE Voice Agent...")
    
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
            ws_url=LIVEKIT_URL,
        ),
    )
