import requests
import os

BASE_URL = "http://localhost:4000/api"

# Set AUTH_TOKEN environment variable before running the test
AUTH_TOKEN = os.getenv("AUTH_TOKEN", "your-valid-jwt-token-here")

HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30


def test_start_campaign_by_id():
    campaign_id = None
    # Create a campaign first to get a valid campaign id
    create_campaign_url = f"{BASE_URL}/campaigns"
    create_payload = {
        "name": "Test Campaign for Start",
        "description": "Campaign created for testing start functionality"
    }

    try:
        # Create campaign
        create_resp = requests.post(create_campaign_url, json=create_payload, headers=HEADERS, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Failed to create campaign: {create_resp.text}"
        campaign = create_resp.json()
        campaign_id = campaign.get("id")
        assert campaign_id, "Campaign ID not returned after creation"

        # Start the campaign
        start_url = f"{BASE_URL}/campaigns/{campaign_id}/start"
        start_resp = requests.post(start_url, headers=HEADERS, timeout=TIMEOUT)
        assert start_resp.status_code == 200, f"Failed to start campaign {campaign_id}: {start_resp.text}"

    finally:
        if campaign_id:
            # Clean up by deleting the campaign
            delete_url = f"{BASE_URL}/campaigns/{campaign_id}"
            try:
                del_resp = requests.delete(delete_url, headers=HEADERS, timeout=TIMEOUT)
                assert del_resp.status_code == 200, f"Failed to delete campaign {campaign_id}: {del_resp.text}"
            except Exception:
                # Suppress exceptions in cleanup to not mask test failure
                pass


test_start_campaign_by_id()
