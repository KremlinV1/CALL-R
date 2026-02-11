"""
API Client - Communicates with PON-E-LINE backend for agent operations.
"""

import os
from typing import Optional, Any
from dataclasses import dataclass
import httpx
from loguru import logger


@dataclass
class AgentData:
    """Data structure for agent configuration from backend."""
    id: str
    name: str
    voice_provider: str
    voice_id: str
    voice_settings: dict
    llm_provider: str
    llm_model: str
    llm_settings: dict
    system_prompt: str
    opening_message: str
    variables: list
    actions: dict
    background_noise: dict


@dataclass
class CampaignContact:
    """Contact data from a campaign."""
    id: str
    phone_number: str
    first_name: str
    last_name: str
    email: Optional[str]
    company: Optional[str]
    custom_fields: dict


class PONELineAPI:
    """Client for PON-E-LINE backend API."""
    
    def __init__(
        self,
        base_url: str = None,
        api_key: str = None
    ):
        self.base_url = base_url or os.getenv("BACKEND_URL", "http://localhost:3001")
        self.api_key = api_key or os.getenv("INTERNAL_API_KEY", "")
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def get_agent(self, agent_id: str) -> Optional[AgentData]:
        """Fetch agent configuration from backend."""
        try:
            client = await self._get_client()
            response = await client.get(f"/api/agents/{agent_id}")
            response.raise_for_status()
            data = response.json()
            
            return AgentData(
                id=data["id"],
                name=data["name"],
                voice_provider=data.get("voiceProvider", "cartesia"),
                voice_id=data.get("voiceId", ""),
                voice_settings=data.get("voiceSettings", {}),
                llm_provider=data.get("llmProvider", "openai"),
                llm_model=data.get("llmModel", "gpt-4o-mini"),
                llm_settings=data.get("llmSettings", {}),
                system_prompt=data.get("systemPrompt", ""),
                opening_message=data.get("openingMessage", ""),
                variables=data.get("variables", []),
                actions=data.get("actions", {}),
                background_noise=data.get("backgroundNoise", {"enabled": False})
            )
        except Exception as e:
            logger.error(f"Failed to fetch agent {agent_id}: {e}")
            return None
    
    async def get_campaign_contact(
        self,
        campaign_id: str,
        contact_id: str
    ) -> Optional[CampaignContact]:
        """Fetch contact data for a campaign call."""
        try:
            client = await self._get_client()
            response = await client.get(
                f"/api/campaigns/{campaign_id}/contacts/{contact_id}"
            )
            response.raise_for_status()
            data = response.json()
            
            return CampaignContact(
                id=data["id"],
                phone_number=data["phoneNumber"],
                first_name=data.get("firstName", ""),
                last_name=data.get("lastName", ""),
                email=data.get("email"),
                company=data.get("company"),
                custom_fields=data.get("customFields", {})
            )
        except Exception as e:
            logger.error(f"Failed to fetch contact: {e}")
            return None
    
    async def update_call_status(
        self,
        call_id: str,
        status: str,
        metadata: Optional[dict] = None
    ) -> bool:
        """Update call status in backend."""
        try:
            client = await self._get_client()
            response = await client.patch(
                f"/api/calls/{call_id}",
                json={
                    "status": status,
                    **(metadata or {})
                }
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to update call status: {e}")
            return False
    
    async def save_transcript(
        self,
        call_id: str,
        transcript: list,
        summary: Optional[str] = None
    ) -> bool:
        """Save call transcript to backend."""
        try:
            client = await self._get_client()
            response = await client.post(
                f"/api/calls/{call_id}/transcript",
                json={
                    "transcript": transcript,
                    "summary": summary
                }
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to save transcript: {e}")
            return False
    
    async def log_call_event(
        self,
        call_id: str,
        event_type: str,
        event_data: dict
    ) -> bool:
        """Log a call event for analytics."""
        try:
            client = await self._get_client()
            response = await client.post(
                f"/api/calls/{call_id}/events",
                json={
                    "type": event_type,
                    "data": event_data
                }
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to log call event: {e}")
            return False
    
    async def request_transfer(
        self,
        call_id: str,
        destination: str,
        reason: Optional[str] = None
    ) -> dict:
        """Request a call transfer to human agent."""
        try:
            client = await self._get_client()
            response = await client.post(
                f"/api/calls/{call_id}/transfer",
                json={
                    "destination": destination,
                    "reason": reason
                }
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to request transfer: {e}")
            return {"success": False, "error": str(e)}
    
    async def send_sms(
        self,
        phone_number: str,
        message: str,
        call_id: Optional[str] = None
    ) -> bool:
        """Send an SMS via the backend."""
        try:
            client = await self._get_client()
            response = await client.post(
                "/api/sms/send",
                json={
                    "to": phone_number,
                    "message": message,
                    "call_id": call_id
                }
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to send SMS: {e}")
            return False
    
    async def book_appointment(
        self,
        contact_id: str,
        date: str,
        time: str,
        service: str,
        notes: Optional[str] = None
    ) -> dict:
        """Book an appointment via the backend."""
        try:
            client = await self._get_client()
            response = await client.post(
                "/api/appointments",
                json={
                    "contact_id": contact_id,
                    "date": date,
                    "time": time,
                    "service": service,
                    "notes": notes
                }
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to book appointment: {e}")
            return {"success": False, "error": str(e)}


# Convenience function for creating the API client
def create_api_client() -> PONELineAPI:
    """Create an API client with environment configuration."""
    return PONELineAPI(
        base_url=os.getenv("BACKEND_URL", "http://localhost:3001"),
        api_key=os.getenv("INTERNAL_API_KEY", "")
    )
