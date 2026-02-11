import requests

BASE_URL = "http://localhost:4000/api"
TIMEOUT = 30

def test_user_login_with_valid_credentials():
    url = f"{BASE_URL}/auth/login"
    headers = {
        "Content-Type": "application/json"
    }
    # Sample valid credentials for testing purpose
    payload = {
        "email": "validuser@example.com",
        "password": "validpassword123"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected status 200, got {response.status_code}"
        json_resp = response.json()
        assert "token" in json_resp or "jwt" in json_resp, "Response JSON does not contain JWT token"
        token = json_resp.get("token") or json_resp.get("jwt")
        assert isinstance(token, str) and len(token) > 0, "JWT token is empty or invalid"
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_user_login_with_valid_credentials()