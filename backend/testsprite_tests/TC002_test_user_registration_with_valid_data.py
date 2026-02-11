import requests

BASE_URL = "http://localhost:4000/api"
HEADERS = {
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_user_registration_with_valid_data():
    url = f"{BASE_URL}/auth/register"
    payload = {
        "email": "testuser@example.com",
        "password": "TestPass123!"
    }
    try:
        response = requests.post(url, headers=HEADERS, json=payload, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 201, f"Expected status code 201, got {response.status_code}"

test_user_registration_with_valid_data()
