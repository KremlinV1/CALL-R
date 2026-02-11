import requests
import uuid

BASE_URL = "http://localhost:4000/api"
TOKEN = "your-super-secret-jwt-key-change-in-production"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_delete_agent_by_id():
    # Create a new agent to delete
    create_agent_url = f"{BASE_URL}/agents"
    agent_data = {
        "name": f"Test Agent {uuid.uuid4()}",
        "description": "Temporary agent for deletion test",
        "voiceConfig": {
            "voice": "en-US-Wavenet-D",
            "speed": 1.0,
            "pitch": 0.0
        }
    }
    agent_id = None
    try:
        create_resp = requests.post(create_agent_url, json=agent_data, headers=HEADERS, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Agent creation failed: {create_resp.text}"
        agent_id = create_resp.json().get("id")
        assert agent_id is not None, "Created agent response missing 'id'"

        # Delete the created agent
        delete_agent_url = f"{BASE_URL}/agents/{agent_id}"
        delete_resp = requests.delete(delete_agent_url, headers=HEADERS, timeout=TIMEOUT)
        assert delete_resp.status_code == 200, f"Agent deletion failed: {delete_resp.text}"

        # Verify the agent no longer exists by attempting to GET it
        get_resp = requests.get(delete_agent_url, headers=HEADERS, timeout=TIMEOUT)
        assert get_resp.status_code == 404 or get_resp.status_code == 400, (
            f"Deleted agent still accessible, status code: {get_resp.status_code}"
        )

    finally:
        # Cleanup - In case the agent was not deleted during the test
        if agent_id:
            requests.delete(f"{BASE_URL}/agents/{agent_id}", headers=HEADERS, timeout=TIMEOUT)

test_delete_agent_by_id()