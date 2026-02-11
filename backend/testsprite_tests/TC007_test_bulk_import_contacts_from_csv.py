import requests
from io import StringIO

BASE_URL = "http://localhost:4000/api"
TOKEN = "your-super-secret-jwt-key-change-in-production"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
}

def test_bulk_import_contacts_from_csv():
    csv_content = (
        "name,email,phone\n"
        "Alice Smith,alice.smith@example.com,+12345678901\n"
        "Bob Johnson,bob.johnson@example.com,+19876543210\n"
        "Charlie Rose,charlie.rose@example.com,+10987654321\n"
    )
    files = {
        'file': ('contacts.csv', StringIO(csv_content), 'text/csv')
    }
    try:
        response = requests.post(
            f"{BASE_URL}/contacts/bulk",
            headers=HEADERS,
            files=files,
            timeout=30
        )
        assert response.status_code == 201, f"Expected status code 201, got {response.status_code}"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_bulk_import_contacts_from_csv()
