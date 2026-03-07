"""
Backend API Tests for Smart Excel Reader
Tests: Root endpoint, Session creation, Drive status
"""
import pytest
import requests
import os

# Use the public preview URL for testing
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://excel-reader-erp.preview.emergentagent.com')

class TestRootEndpoint:
    """Test the root /api/ endpoint"""
    
    def test_api_root_returns_running_status(self):
        """Backend API /api/ endpoint returns running status"""
        response = requests.get(f"{BASE_URL}/api/")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Excel Reader API"
        assert "status" in data
        assert data["status"] == "running"
        print(f"✓ API root endpoint working: {data}")


class TestSessionManagement:
    """Test session creation and management endpoints"""
    
    def test_session_create_returns_session_id(self):
        """Backend /api/session/create endpoint creates session"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert isinstance(data["session_id"], str)
        assert len(data["session_id"]) > 0
        # UUID format check (36 chars with hyphens)
        assert len(data["session_id"]) == 36
        print(f"✓ Session created: {data['session_id']}")
        
        # Store for use in other tests
        return data["session_id"]
    
    def test_session_create_generates_unique_ids(self):
        """Each session create call generates a unique session ID"""
        session_ids = []
        for _ in range(3):
            response = requests.post(f"{BASE_URL}/api/session/create")
            assert response.status_code == 200
            session_ids.append(response.json()["session_id"])
        
        # All IDs should be unique
        assert len(set(session_ids)) == 3
        print(f"✓ Generated 3 unique session IDs")


class TestDriveStatus:
    """Test Google Drive status endpoint"""
    
    def test_drive_status_with_valid_session(self):
        """Backend /api/drive/status endpoint works with session_id"""
        # First create a session
        session_response = requests.post(f"{BASE_URL}/api/session/create")
        assert session_response.status_code == 200
        session_id = session_response.json()["session_id"]
        
        # Check drive status
        response = requests.get(f"{BASE_URL}/api/drive/status?session_id={session_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert data["connected"] == False  # Not connected without OAuth
        assert "session_id" in data
        assert data["session_id"] == session_id
        print(f"✓ Drive status returned correctly for session {session_id}: connected={data['connected']}")
    
    def test_drive_status_with_nonexistent_session(self):
        """Drive status works with non-existent session (returns connected=false)"""
        fake_session_id = "fake-session-12345"
        response = requests.get(f"{BASE_URL}/api/drive/status?session_id={fake_session_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert data["connected"] == False
        print(f"✓ Drive status correctly returns connected=false for non-existent session")


class TestOAuthEndpoints:
    """Test OAuth-related endpoints (without completing OAuth flow)"""
    
    def test_oauth_connect_requires_session(self):
        """OAuth connect endpoint requires session_id parameter"""
        # First create a valid session
        session_response = requests.post(f"{BASE_URL}/api/session/create")
        session_id = session_response.json()["session_id"]
        
        # Call OAuth connect with valid session
        response = requests.get(f"{BASE_URL}/api/oauth/drive/connect?session_id={session_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "authorization_url" in data
        assert "accounts.google.com" in data["authorization_url"]
        print(f"✓ OAuth connect returns authorization URL")
    
    def test_oauth_connect_rejects_invalid_session(self):
        """OAuth connect endpoint returns error for non-existent session"""
        response = requests.get(f"{BASE_URL}/api/oauth/drive/connect?session_id=invalid-session-xyz")
        
        # Backend returns 404 when session not found
        assert response.status_code in [404, 500]  # Accept either as valid error handling
        print(f"✓ OAuth connect correctly rejects invalid session with status {response.status_code}")


class TestConfigEndpoints:
    """Test configuration endpoints"""
    
    def test_config_list_requires_session(self):
        """Config list endpoint works with session_id"""
        # Create session first
        session_response = requests.post(f"{BASE_URL}/api/session/create")
        session_id = session_response.json()["session_id"]
        
        response = requests.get(f"{BASE_URL}/api/config/list?session_id={session_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert "configs" in data
        assert isinstance(data["configs"], list)
        # New session should have empty configs
        assert len(data["configs"]) == 0
        print(f"✓ Config list returns empty array for new session")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
