"""
Backend tests for OAuth flow, manual connect, and callback endpoints.
Focus: New OAuth HTML callback and manual code entry functionality.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://parchi-quotation-dev.preview.emergentagent.com')


class TestSessionCreate:
    """Test POST /api/session/create endpoint"""
    
    def test_create_session_returns_session_id(self):
        """POST /api/session/create returns session_id"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "session_id" in data, "Response should contain session_id"
        assert isinstance(data["session_id"], str), "session_id should be a string"
        assert len(data["session_id"]) > 0, "session_id should not be empty"
        print(f"✓ Created session: {data['session_id']}")


class TestOAuthDriveConnect:
    """Test GET /api/oauth/drive/connect endpoint"""
    
    @pytest.fixture
    def session_id(self):
        """Create a fresh session for OAuth tests"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        return response.json()["session_id"]
    
    def test_oauth_connect_returns_authorization_url(self, session_id):
        """GET /api/oauth/drive/connect?session_id=XXX returns authorization_url"""
        response = requests.get(f"{BASE_URL}/api/oauth/drive/connect?session_id={session_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "authorization_url" in data, "Response should contain authorization_url"
        auth_url = data["authorization_url"]
        assert auth_url.startswith("https://accounts.google.com/o/oauth2/auth"), \
            f"authorization_url should start with Google OAuth URL, got: {auth_url[:100]}"
        print(f"✓ Got authorization URL: {auth_url[:80]}...")
    
    def test_oauth_connect_url_contains_redirect_uri(self, session_id):
        """authorization_url contains correct redirect_uri parameter"""
        response = requests.get(f"{BASE_URL}/api/oauth/drive/connect?session_id={session_id}")
        data = response.json()
        auth_url = data["authorization_url"]
        # Check that redirect_uri is present in the URL
        assert "redirect_uri=" in auth_url, "authorization_url should contain redirect_uri parameter"
        # URL should contain the callback endpoint
        assert "oauth%2Fdrive%2Fcallback" in auth_url.lower() or "oauth/drive/callback" in auth_url, \
            "redirect_uri should point to oauth/drive/callback"
        print(f"✓ redirect_uri parameter found in authorization URL")
    
    def test_oauth_connect_invalid_session_returns_404(self):
        """GET /api/oauth/drive/connect with invalid session returns 404"""
        fake_session = "invalid-session-id-12345"
        response = requests.get(f"{BASE_URL}/api/oauth/drive/connect?session_id={fake_session}")
        assert response.status_code == 404, f"Expected 404 for invalid session, got {response.status_code}"
        print("✓ Returns 404 for invalid session")


class TestOAuthCallback:
    """Test GET /api/oauth/drive/callback endpoint - HTML response"""
    
    def test_callback_returns_html_not_redirect_on_error(self):
        """GET /api/oauth/drive/callback returns HTML (not redirect) with status 400 for invalid code"""
        # Using a test code and state
        response = requests.get(
            f"{BASE_URL}/api/oauth/drive/callback?code=test&state=fake-session",
            allow_redirects=False  # Don't follow redirects
        )
        # Should return 400 for invalid code, not 302 redirect
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        # Check response is HTML, not JSON
        content_type = response.headers.get('content-type', '')
        assert 'text/html' in content_type, f"Expected text/html, got {content_type}"
        
        # Check HTML content
        assert '<!DOCTYPE html>' in response.text or '<html>' in response.text, \
            "Response should be HTML"
        assert 'Connection Failed' in response.text, \
            "Error HTML should show 'Connection Failed' message"
        print("✓ Callback returns HTML page with error for invalid code")
    
    def test_callback_html_contains_error_message(self):
        """Callback error HTML contains descriptive error message"""
        response = requests.get(
            f"{BASE_URL}/api/oauth/drive/callback?code=test_invalid&state=invalid-state"
        )
        assert response.status_code == 400
        # Check that error message is displayed in HTML
        assert 'Error' in response.text or 'Failed' in response.text, \
            "Error page should display error information"
        print("✓ Error HTML contains descriptive message")


class TestManualConnect:
    """Test POST /api/oauth/drive/manual-connect endpoint"""
    
    @pytest.fixture
    def session_id(self):
        """Create a fresh session for manual connect tests"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        return response.json()["session_id"]
    
    def test_manual_connect_invalid_session_returns_404(self):
        """POST /api/oauth/drive/manual-connect with invalid session returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/oauth/drive/manual-connect",
            json={"session_id": "invalid-session-12345", "auth_code": "test_code"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response should have detail"
        assert "session" in data["detail"].lower() or "not found" in data["detail"].lower()
        print("✓ Returns 404 for invalid session")
    
    def test_manual_connect_invalid_code_returns_500(self, session_id):
        """POST /api/oauth/drive/manual-connect with valid session but invalid code returns 500"""
        response = requests.post(
            f"{BASE_URL}/api/oauth/drive/manual-connect",
            json={"session_id": session_id, "auth_code": "invalid_code_123"}
        )
        # Invalid code results in 500 because Google API throws an error
        assert response.status_code == 500, f"Expected 500, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response should have detail"
        print(f"✓ Returns 500 with error: {data['detail'][:80]}...")
    
    def test_manual_connect_requires_both_fields(self):
        """POST /api/oauth/drive/manual-connect requires session_id and auth_code"""
        # Missing auth_code
        response = requests.post(
            f"{BASE_URL}/api/oauth/drive/manual-connect",
            json={"session_id": "test"}
        )
        assert response.status_code == 422, f"Expected 422 for missing field, got {response.status_code}"
        print("✓ Validates required fields")


class TestDriveStatus:
    """Test GET /api/drive/status endpoint"""
    
    @pytest.fixture
    def session_id(self):
        response = requests.post(f"{BASE_URL}/api/session/create")
        return response.json()["session_id"]
    
    def test_drive_status_new_session_not_connected(self, session_id):
        """New session should show as not connected"""
        response = requests.get(f"{BASE_URL}/api/drive/status?session_id={session_id}")
        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert data["connected"] is False
        assert data["session_id"] == session_id
        print("✓ New session shows as not connected")


class TestLayoutCRUD:
    """Regression tests for Layout CRUD endpoints"""
    
    @pytest.fixture
    def session_id(self):
        response = requests.post(f"{BASE_URL}/api/session/create")
        return response.json()["session_id"]
    
    def test_create_layout(self, session_id):
        """POST /api/layouts/save creates a layout"""
        response = requests.post(
            f"{BASE_URL}/api/layouts/save",
            json={
                "session_id": session_id,
                "name": "TEST_Layout_Regression",
                "layout_type": "jgt",
                "sections": [{"name": "Section1", "rows": [["a", "b"], ["c", "d"]]}]
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "layout_id" in data
        assert data["name"] == "TEST_Layout_Regression"
        print(f"✓ Created layout: {data['layout_id']}")
        return data["layout_id"]
    
    def test_list_layouts(self, session_id):
        """GET /api/layouts/list returns layouts"""
        # First create a layout
        requests.post(
            f"{BASE_URL}/api/layouts/save",
            json={
                "session_id": session_id,
                "name": "TEST_List_Layout",
                "layout_type": "jgt",
                "sections": [{"name": "S1", "rows": [["1", "2"]]}]
            }
        )
        
        response = requests.get(f"{BASE_URL}/api/layouts/list?session_id={session_id}")
        assert response.status_code == 200
        data = response.json()
        assert "layouts" in data
        assert len(data["layouts"]) > 0
        print(f"✓ Listed {len(data['layouts'])} layouts")
    
    def test_get_layout_not_found(self):
        """GET /api/layouts/{layout_id} returns 404 for non-existent"""
        response = requests.get(f"{BASE_URL}/api/layouts/nonexistent-id-123")
        assert response.status_code == 404
        print("✓ Returns 404 for non-existent layout")
    
    def test_delete_layout(self, session_id):
        """DELETE /api/layouts/{layout_id} removes layout"""
        # Create one first
        create_res = requests.post(
            f"{BASE_URL}/api/layouts/save",
            json={
                "session_id": session_id,
                "name": "TEST_Delete_Me",
                "layout_type": "jgi",
                "sections": []
            }
        )
        layout_id = create_res.json()["layout_id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/layouts/{layout_id}")
        assert response.status_code == 200
        
        # Verify it's gone
        get_res = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        assert get_res.status_code == 404
        print("✓ Delete layout works correctly")


class TestHealthCheck:
    """Test API health check"""
    
    def test_root_endpoint(self):
        """GET /api/ returns running status"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        print("✓ API is running")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
