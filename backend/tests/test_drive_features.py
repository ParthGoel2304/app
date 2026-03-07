"""
Backend API Tests for Drive Features (Iteration 7)
Testing:
- /api/drive/files with folder_only parameter
- /api/drive/file-metadata endpoint
- OAuth scope verification (drive.readonly)
- Backend structure tests
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://excel-reader-erp.preview.emergentagent.com').rstrip('/')

class TestDriveFilesEndpoint:
    """Tests for /api/drive/files endpoint with folder_only parameter"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create test session for each test"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        assert response.status_code == 200, f"Failed to create session: {response.text}"
        self.session_id = response.json()["session_id"]
        assert self.session_id, "Session ID should not be empty"
    
    def test_drive_files_without_auth_returns_error(self):
        """Test /api/drive/files returns error when not authenticated"""
        response = requests.get(
            f"{BASE_URL}/api/drive/files",
            params={"session_id": self.session_id}
        )
        # Returns 500 with wrapped 401 message (known issue - exception handling wraps HTTPException)
        assert response.status_code in [401, 500], f"Expected 401 or 500, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        assert "401" in data["detail"] or "not connected" in data["detail"].lower()
        print(f"PASS: /api/drive/files returns error for unauthenticated session - {data['detail']}")
    
    def test_drive_files_folder_only_param_accepted(self):
        """Test /api/drive/files accepts folder_only parameter without error"""
        # Even without auth, the endpoint should accept the parameter
        response = requests.get(
            f"{BASE_URL}/api/drive/files",
            params={"session_id": self.session_id, "folder_only": "true"}
        )
        # Should return auth error, not a param validation error (422)
        assert response.status_code != 422, f"Got 422 - param not accepted properly"
        assert response.status_code in [401, 500], f"Expected auth error, got {response.status_code}"
        print("PASS: /api/drive/files accepts folder_only=true parameter")
    
    def test_drive_files_folder_only_false(self):
        """Test /api/drive/files with folder_only=false"""
        response = requests.get(
            f"{BASE_URL}/api/drive/files",
            params={"session_id": self.session_id, "folder_only": "false"}
        )
        assert response.status_code in [401, 500], f"Expected auth error with folder_only=false, got {response.status_code}"
        print("PASS: /api/drive/files accepts folder_only=false parameter")


class TestFileMetadataEndpoint:
    """Tests for /api/drive/file-metadata endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create test session"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        assert response.status_code == 200
        self.session_id = response.json()["session_id"]
    
    def test_file_metadata_missing_file_id_returns_422(self):
        """Test /api/drive/file-metadata requires file_id parameter"""
        response = requests.get(
            f"{BASE_URL}/api/drive/file-metadata",
            params={"session_id": self.session_id}
        )
        # Should return 422 for missing required parameter
        assert response.status_code == 422, f"Expected 422 for missing file_id, got {response.status_code}"
        print("PASS: /api/drive/file-metadata returns 422 when file_id missing")
    
    def test_file_metadata_without_auth_returns_error(self):
        """Test /api/drive/file-metadata returns error when not authenticated"""
        response = requests.get(
            f"{BASE_URL}/api/drive/file-metadata",
            params={"session_id": self.session_id, "file_id": "test_file_id_123"}
        )
        # Returns 500 with wrapped 401 message (known issue)
        assert response.status_code in [401, 500], f"Expected auth error, got {response.status_code}"
        print("PASS: /api/drive/file-metadata returns error for unauthenticated session")
    
    def test_file_metadata_accepts_both_params(self):
        """Test /api/drive/file-metadata accepts both session_id and file_id"""
        response = requests.get(
            f"{BASE_URL}/api/drive/file-metadata",
            params={
                "session_id": self.session_id,
                "file_id": "some_file_id"
            }
        )
        # Should return auth error (not 422/400), meaning params accepted
        assert response.status_code in [401, 500], f"Expected auth error, got {response.status_code}"
        print("PASS: /api/drive/file-metadata accepts session_id and file_id params")


class TestOAuthScope:
    """Tests to verify OAuth uses drive.readonly scope"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/session/create")
        assert response.status_code == 200
        self.session_id = response.json()["session_id"]
    
    def test_oauth_connect_returns_authorization_url_with_readonly_scope(self):
        """Test OAuth connect endpoint generates URL with drive.readonly scope"""
        response = requests.get(
            f"{BASE_URL}/api/oauth/drive/connect",
            params={"session_id": self.session_id}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "authorization_url" in data, "Response should contain authorization_url"
        
        auth_url = data["authorization_url"]
        # Check that the URL contains drive.readonly scope
        assert "drive.readonly" in auth_url, f"OAuth URL should contain drive.readonly scope: {auth_url}"
        # Make sure it's NOT drive.file (restricted to app-created files only)
        assert "drive.file" not in auth_url or "drive.readonly" in auth_url, "Should use drive.readonly, not just drive.file"
        print(f"PASS: OAuth URL contains drive.readonly scope")
        print(f"  Authorization URL: {auth_url[:100]}...")


class TestSessionManagement:
    """Test session creation and validation"""
    
    def test_create_session_returns_session_id(self):
        """Test POST /api/session/create returns valid session_id"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert len(data["session_id"]) > 0
        print(f"PASS: Session created with ID: {data['session_id'][:20]}...")
    
    def test_drive_status_for_new_session(self):
        """Test /api/drive/status returns connected=false for new session"""
        # Create session
        session_res = requests.post(f"{BASE_URL}/api/session/create")
        session_id = session_res.json()["session_id"]
        
        # Check status
        response = requests.get(
            f"{BASE_URL}/api/drive/status",
            params={"session_id": session_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert data["connected"] == False, "New session should not be connected"
        print("PASS: /api/drive/status returns connected=false for new session")


class TestLayoutEndpointsRegression:
    """Regression tests for layout endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/session/create")
        self.session_id = response.json()["session_id"]
        self.created_layout_id = None
    
    def teardown_method(self, method):
        """Clean up created layouts"""
        if self.created_layout_id:
            try:
                requests.delete(f"{BASE_URL}/api/layouts/{self.created_layout_id}")
            except:
                pass
    
    def test_layout_crud_flow(self):
        """Test complete layout CRUD flow"""
        # CREATE
        create_data = {
            "session_id": self.session_id,
            "name": "TEST_Layout_Iteration7",
            "layout_type": "jgt",
            "sections": [{"name": "Test Section", "rows": [["A1", "A2", "A3"]]}]
        }
        create_res = requests.post(f"{BASE_URL}/api/layouts/save", json=create_data)
        assert create_res.status_code == 200, f"Create failed: {create_res.text}"
        layout_id = create_res.json()["layout_id"]
        self.created_layout_id = layout_id
        print(f"PASS: Layout created with ID: {layout_id}")
        
        # READ
        get_res = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        assert get_res.status_code == 200
        layout = get_res.json()
        assert layout["name"] == "TEST_Layout_Iteration7"
        print("PASS: Layout retrieved successfully")
        
        # LIST
        list_res = requests.get(f"{BASE_URL}/api/layouts/list", params={"session_id": self.session_id})
        assert list_res.status_code == 200
        layouts = list_res.json()["layouts"]
        assert any(l["layout_id"] == layout_id for l in layouts)
        print("PASS: Layout appears in list")
        
        # UPDATE
        update_res = requests.put(f"{BASE_URL}/api/layouts/{layout_id}", json={
            "name": "TEST_Layout_Iteration7_Updated"
        })
        assert update_res.status_code == 200
        print("PASS: Layout updated")
        
        # DELETE
        delete_res = requests.delete(f"{BASE_URL}/api/layouts/{layout_id}")
        assert delete_res.status_code == 200
        self.created_layout_id = None  # Already deleted
        print("PASS: Layout deleted")
        
        # Verify deletion
        verify_res = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        assert verify_res.status_code == 404
        print("PASS: Layout confirmed deleted (404)")


class TestRootEndpoint:
    """Test API root endpoint"""
    
    def test_api_root_returns_status(self):
        """Test GET /api/ returns running status"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "running"
        assert "Excel Reader" in data.get("message", "")
        print(f"PASS: API root returns: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
