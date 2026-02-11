import requests
import uuid

BASE_URL = "http://localhost:4000/api"
TOKEN = "your-super-secret-jwt-key-change-in-production"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_create_new_campaign():
    campaign_data = {
        "name": f"Test Campaign {uuid.uuid4()}",
        "description": "This is a test batch calling campaign created by automated test."
    }

    campaign_id = None
    try:
        # Create the campaign
        response = requests.post(
            f"{BASE_URL}/campaigns",
            json=campaign_data,
            headers=HEADERS,
            timeout=TIMEOUT
        )

        assert response.status_code == 201, f"Expected 201, got {response.status_code}"
        json_resp = response.json()
        assert isinstance(json_resp, dict), "Response is not a JSON object"
        assert "id" in json_resp, "Response JSON does not contain 'id'"
        campaign_id = json_resp["id"]
        assert json_resp.get("name") == campaign_data["name"], "Campaign name mismatch in response"
    except requests.RequestException as e:
        assert False, f"Request failed with exception: {e}"
    finally:
        if campaign_id:
            # Cleanup - delete the created campaign to keep environment clean
            try:
                del_resp = requests.delete(
                    f"{BASE_URL}/campaigns/{campaign_id}",
                    headers=HEADERS,
                    timeout=TIMEOUT
                )
                # Accept 200 or 204 as successful deletion
                assert del_resp.status_code in [200, 204], f"Failed to delete campaign {campaign_id} (status {del_resp.status_code})"
            except requests.RequestException:
                pass

test_create_new_campaign()
