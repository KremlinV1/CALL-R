import requests

BASE_URL = "http://localhost:4000/api"
AUTH_TOKEN = "your-super-secret-jwt-key-change-in-production"
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

def test_create_new_agent():
    url = f"{BASE_URL}/agents"
    payload = {
        "name": "Test AI Voice Agent",
        "description": "Agent created for testing TC003",
        "voiceConfig": {
            "language": "en-US",
            "voice": "en-US-Wavenet-D",
            "speed": 1.0,
            "pitch": 0.0
        },
        "version": "1.0.0",
        "enabled": True,
        "integration": {
            "type": "livekit_sip",
            "settings": {
                "sipUri": "sip:testagent@livekit.example.com",
                "authorizationToken": "test-sip-auth-token"
            }
        }
    }
    agent_id = None
    try:
        response = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        assert response.status_code == 201, f"Expected status 201, got {response.status_code}"
        data = response.json()
        # Validate response contains at least an 'id' field
        assert "id" in data and isinstance(data["id"], str) and data["id"], "Response JSON must contain agent 'id'"
        agent_id = data["id"]
    finally:
        # Cleanup: delete created agent if it was created
        if agent_id:
            delete_url = f"{BASE_URL}/agents/{agent_id}"
            try:
                del_resp = requests.delete(delete_url, headers=HEADERS, timeout=30)
                # It's okay if deletion failed, just log/assert silently here
                assert del_resp.status_code == 200 or del_resp.status_code == 204, f"Failed to delete agent {agent_id}"
            except Exception:
                pass

test_create_new_agent()
