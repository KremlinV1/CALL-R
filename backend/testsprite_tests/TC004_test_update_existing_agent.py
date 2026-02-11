import requests

base_url = "http://localhost:4000/api"
headers = {
    "Content-Type": "application/json"
}
timeout = 30


def test_update_existing_agent():
    agent_create_url = f"{base_url}/agents"
    agent_update_url_template = f"{base_url}/agents/{{id}}"
    agent_delete_url_template = f"{base_url}/agents/{{id}}"

    # Sample payload for creating an agent (adjust fields as needed)
    create_payload = {
        "name": "Test Agent",
        "voiceSettings": {
            "language": "en-US",
            "voice": "en-US-Wavenet-D",
            "speed": 1.0,
            "pitch": 0.0
        },
        "description": "Agent created for update test"
    }

    # Sample payload for update
    update_payload = {
        "name": "Updated Test Agent",
        "voiceSettings": {
            "language": "en-GB",
            "voice": "en-GB-Wavenet-B",
            "speed": 0.9,
            "pitch": 0.1
        },
        "description": "Updated agent details for test"
    }

    agent_id = None
    try:
        # Create an agent to update
        create_resp = requests.post(
            agent_create_url, json=create_payload, headers=headers, timeout=timeout
        )
        assert create_resp.status_code == 201, f"Agent creation failed: {create_resp.text}"
        agent_data = create_resp.json()
        agent_id = agent_data.get("id")
        assert agent_id is not None, "Created agent ID not returned"

        # Update the existing agent
        update_url = agent_update_url_template.format(id=agent_id)
        update_resp = requests.put(
            update_url, json=update_payload, headers=headers, timeout=timeout
        )
        assert update_resp.status_code == 200, f"Agent update failed: {update_resp.text}"
        updated_data = update_resp.json()

        # Validate updated fields
        assert updated_data.get("name") == update_payload["name"], "Agent name not updated"
        assert updated_data.get("description") == update_payload["description"], "Agent description not updated"

        voice_settings = updated_data.get("voiceSettings", {})
        assert voice_settings.get("language") == update_payload["voiceSettings"]["language"], "Language not updated"
        assert voice_settings.get("voice") == update_payload["voiceSettings"]["voice"], "Voice not updated"
        assert abs(voice_settings.get("speed", 0) - update_payload["voiceSettings"]["speed"]) < 0.01, "Speed not updated correctly"
        assert abs(voice_settings.get("pitch", 0) - update_payload["voiceSettings"]["pitch"]) < 0.01, "Pitch not updated correctly"

    finally:
        if agent_id:
            delete_url = agent_delete_url_template.format(id=agent_id)
            try:
                del_resp = requests.delete(delete_url, headers=headers, timeout=timeout)
                assert del_resp.status_code == 200, f"Agent deletion failed: {del_resp.text}"
            except Exception:
                pass


test_update_existing_agent()
