import requests

BASE_URL = "http://localhost:4000/api"
TOKEN = "your-super-secret-jwt-key-change-in-production"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}
TIMEOUT = 30

def test_list_contacts_with_pagination_and_search():
    params = {
        "page": 1,
        "limit": 10,
        "search": "test"
    }
    try:
        response = requests.get(
            f"{BASE_URL}/contacts",
            headers=HEADERS,
            params=params,
            timeout=TIMEOUT
        )
        assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"

        data = response.json()
        # Validate pagination keys presence
        assert isinstance(data, dict), "Response is not a JSON object"
        # Common pagination response might have keys like items, total, page, limit
        assert "items" in data or "contacts" in data, "No contacts list found in response"
        assert "page" in data or "currentPage" in data, "Pagination page info missing"
        assert "limit" in data or "pageSize" in data, "Pagination limit info missing"
        # Validate that returned contacts match search query if possible
        contacts = data.get("items") or data.get("contacts") or []
        assert isinstance(contacts, list), "Contacts is not a list"
        # Checking search filter effect if contacts returned
        if contacts:
            found = False
            for contact in contacts:
                # Check if search term appears in any string field of the contact
                if any(isinstance(v, str) and params["search"].lower() in v.lower() for v in contact.values()):
                    found = True
                    break
            assert found, "Search term not found in any returned contact"

    except requests.exceptions.RequestException as e:
        assert False, f"Request to list contacts failed: {e}"

test_list_contacts_with_pagination_and_search()