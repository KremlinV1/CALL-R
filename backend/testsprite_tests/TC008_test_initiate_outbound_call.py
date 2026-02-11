import requests

BASE_URL = "http://localhost:4000/api"
AUTH_TOKEN = "your-super-secret-jwt-key-change-in-production"
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_initiate_outbound_call():
    # First, create a new agent to use its ID for the call initiation
    agent_payload = {
        "name": "Test Agent for Outbound Call",
        "description": "Agent created for testing outbound call initiation"
    }
    agent_id = None
    call_id = None

    try:
        # Create agent
        resp_create_agent = requests.post(f"{BASE_URL}/agents", json=agent_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_create_agent.status_code == 201, f"Agent creation failed: {resp_create_agent.text}"
        agent_data = resp_create_agent.json()
        agent_id = agent_data.get("id") or agent_data.get("agentId")
        assert agent_id, "No agent ID returned from agent creation"

        # Use a valid phone number for testing - dummy/test number
        to_number = "+15555550100"

        # Initiate outbound call
        call_payload = {
            "agentId": agent_id,
            "toNumber": to_number
        }
        resp_call = requests.post(f"{BASE_URL}/calls/outbound", json=call_payload, headers=HEADERS, timeout=TIMEOUT)
        assert resp_call.status_code == 201, f"Outbound call initiation failed: {resp_call.text}"
        call_data = resp_call.json()
        call_id = call_data.get("id") or call_data.get("callId")

        # Validate response contains expected keys (optional)
        assert call_data.get("agentId") == agent_id, "Agent ID mismatch in call response"
        assert call_data.get("toNumber") == to_number, "To number mismatch in call response"

    finally:
        # Clean up: delete created agent
        if agent_id:
            try:
                requests.delete(f"{BASE_URL}/agents/{agent_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass
        # No API for deleting calls was described, so no call cleanup

test_initiate_outbound_call()
