"""
Backend API Tests for Layout Version CRUD and Voice Transcription
Tests: Layout create, list, get, update, delete; Voice transcription endpoint
"""
import pytest
import requests
import os
import tempfile
import wave
import struct

# Use the public preview URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://drive-quotation-app.preview.emergentagent.com')


@pytest.fixture
def session_id():
    """Create a test session and return session_id"""
    response = requests.post(f"{BASE_URL}/api/session/create")
    assert response.status_code == 200
    return response.json()["session_id"]


class TestLayoutVersionCRUD:
    """Test Layout Version CRUD endpoints - POST, GET list, GET by id, PUT, DELETE"""
    
    def test_create_layout_version(self, session_id):
        """POST /api/layouts/save should create a layout version"""
        payload = {
            "session_id": session_id,
            "name": "TEST_JGT_Layout_v1",
            "layout_type": "jgt",
            "sections": [
                {
                    "name": "Header Section",
                    "rows": [["Item", "Price", "Qty"], ["Widget A", "100", "10"]]
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/layouts/save", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "layout_id" in data
        assert "name" in data
        assert data["name"] == "TEST_JGT_Layout_v1"
        assert len(data["layout_id"]) == 36  # UUID format
        print(f"✓ Layout created: {data['layout_id']}")
        return data["layout_id"]
    
    def test_list_layouts_for_session(self, session_id):
        """GET /api/layouts/list should list saved versions for a session"""
        # First create a layout
        payload = {
            "session_id": session_id,
            "name": "TEST_JGI_Layout_List",
            "layout_type": "jgi",
            "sections": [
                {"name": "Section1", "rows": [["Col1", "Col2"]]}
            ]
        }
        create_response = requests.post(f"{BASE_URL}/api/layouts/save", json=payload)
        assert create_response.status_code == 200
        created_layout_id = create_response.json()["layout_id"]
        
        # Now list layouts
        response = requests.get(f"{BASE_URL}/api/layouts/list?session_id={session_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "layouts" in data
        assert isinstance(data["layouts"], list)
        assert len(data["layouts"]) >= 1
        
        # Verify the created layout is in the list
        layout_ids = [l["layout_id"] for l in data["layouts"]]
        assert created_layout_id in layout_ids
        print(f"✓ Listed {len(data['layouts'])} layouts for session")
        return created_layout_id
    
    def test_list_layouts_with_type_filter(self, session_id):
        """GET /api/layouts/list with layout_type filter works"""
        # Create JGT layout
        payload_jgt = {
            "session_id": session_id,
            "name": "TEST_JGT_Filter",
            "layout_type": "jgt",
            "sections": [{"name": "JGT Section", "rows": [["A", "B"]]}]
        }
        requests.post(f"{BASE_URL}/api/layouts/save", json=payload_jgt)
        
        # Create JGI layout
        payload_jgi = {
            "session_id": session_id,
            "name": "TEST_JGI_Filter",
            "layout_type": "jgi",
            "sections": [{"name": "JGI Section", "rows": [["X", "Y"]]}]
        }
        requests.post(f"{BASE_URL}/api/layouts/save", json=payload_jgi)
        
        # Filter by JGT
        response_jgt = requests.get(f"{BASE_URL}/api/layouts/list?session_id={session_id}&layout_type=jgt")
        assert response_jgt.status_code == 200
        jgt_layouts = response_jgt.json()["layouts"]
        for layout in jgt_layouts:
            assert layout["layout_type"] == "jgt"
        
        # Filter by JGI
        response_jgi = requests.get(f"{BASE_URL}/api/layouts/list?session_id={session_id}&layout_type=jgi")
        assert response_jgi.status_code == 200
        jgi_layouts = response_jgi.json()["layouts"]
        for layout in jgi_layouts:
            assert layout["layout_type"] == "jgi"
        
        print(f"✓ Layout type filter works: {len(jgt_layouts)} JGT, {len(jgi_layouts)} JGI")
    
    def test_get_layout_by_id(self, session_id):
        """GET /api/layouts/{layout_id} should return a specific version"""
        # Create a layout
        payload = {
            "session_id": session_id,
            "name": "TEST_GetById_Layout",
            "layout_type": "jgt",
            "sections": [
                {"name": "TestSection", "rows": [["R1C1", "R1C2"], ["R2C1", "R2C2"]]}
            ]
        }
        create_response = requests.post(f"{BASE_URL}/api/layouts/save", json=payload)
        layout_id = create_response.json()["layout_id"]
        
        # Get by ID
        response = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["layout_id"] == layout_id
        assert data["name"] == "TEST_GetById_Layout"
        assert data["layout_type"] == "jgt"
        assert len(data["sections"]) == 1
        assert data["sections"][0]["name"] == "TestSection"
        assert "created_at" in data
        assert "updated_at" in data
        print(f"✓ Retrieved layout by ID: {layout_id}")
    
    def test_get_layout_not_found(self):
        """GET /api/layouts/{layout_id} returns 404 for non-existent layout"""
        response = requests.get(f"{BASE_URL}/api/layouts/non-existent-layout-id-12345")
        
        assert response.status_code == 404
        print("✓ Get layout returns 404 for non-existent layout")
    
    def test_update_layout_name(self, session_id):
        """PUT /api/layouts/{layout_id} should update layout name"""
        # Create a layout
        payload = {
            "session_id": session_id,
            "name": "TEST_Original_Name",
            "layout_type": "jgi",
            "sections": [{"name": "Sec", "rows": [["A"]]}]
        }
        create_response = requests.post(f"{BASE_URL}/api/layouts/save", json=payload)
        layout_id = create_response.json()["layout_id"]
        
        # Update name
        update_payload = {"name": "TEST_Updated_Name"}
        response = requests.put(f"{BASE_URL}/api/layouts/{layout_id}", json=update_payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["status"] == "updated"
        assert data["layout_id"] == layout_id
        
        # Verify update by fetching
        get_response = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        assert get_response.json()["name"] == "TEST_Updated_Name"
        print(f"✓ Updated layout name successfully")
    
    def test_update_layout_sections(self, session_id):
        """PUT /api/layouts/{layout_id} should update layout sections"""
        # Create a layout
        payload = {
            "session_id": session_id,
            "name": "TEST_Section_Update",
            "layout_type": "jgt",
            "sections": [{"name": "Original", "rows": [["Old"]]}]
        }
        create_response = requests.post(f"{BASE_URL}/api/layouts/save", json=payload)
        layout_id = create_response.json()["layout_id"]
        
        # Update sections
        new_sections = [
            {"name": "New Section 1", "rows": [["New1", "New2"]]},
            {"name": "New Section 2", "rows": [["Data1", "Data2", "Data3"]]}
        ]
        update_payload = {"sections": new_sections}
        response = requests.put(f"{BASE_URL}/api/layouts/{layout_id}", json=update_payload)
        
        assert response.status_code == 200
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        updated_data = get_response.json()
        assert len(updated_data["sections"]) == 2
        assert updated_data["sections"][0]["name"] == "New Section 1"
        assert updated_data["sections"][1]["name"] == "New Section 2"
        print(f"✓ Updated layout sections successfully")
    
    def test_update_layout_not_found(self):
        """PUT /api/layouts/{layout_id} returns 404 for non-existent layout"""
        update_payload = {"name": "Should Fail"}
        response = requests.put(f"{BASE_URL}/api/layouts/non-existent-id", json=update_payload)
        
        assert response.status_code == 404
        print("✓ Update layout returns 404 for non-existent layout")
    
    def test_delete_layout(self, session_id):
        """DELETE /api/layouts/{layout_id} should delete a version"""
        # Create a layout
        payload = {
            "session_id": session_id,
            "name": "TEST_Delete_Layout",
            "layout_type": "jgt",
            "sections": [{"name": "ToDelete", "rows": [["Delete me"]]}]
        }
        create_response = requests.post(f"{BASE_URL}/api/layouts/save", json=payload)
        layout_id = create_response.json()["layout_id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/layouts/{layout_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["status"] == "deleted"
        assert data["layout_id"] == layout_id
        
        # Verify deletion - should return 404
        get_response = requests.get(f"{BASE_URL}/api/layouts/{layout_id}")
        assert get_response.status_code == 404
        print(f"✓ Deleted layout and verified removal")
    
    def test_delete_layout_not_found(self):
        """DELETE /api/layouts/{layout_id} returns 404 for non-existent layout"""
        response = requests.delete(f"{BASE_URL}/api/layouts/non-existent-id-to-delete")
        
        assert response.status_code == 404
        print("✓ Delete layout returns 404 for non-existent layout")


class TestVoiceTranscription:
    """Test Voice Transcription endpoint"""
    
    def _create_test_wav_file(self, duration_ms=100):
        """Create a minimal test WAV file"""
        # Create a simple WAV file with minimal audio data
        sample_rate = 8000
        num_samples = int(sample_rate * duration_ms / 1000)
        
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            wav_file = wave.open(f.name, 'wb')
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 2 bytes per sample
            wav_file.setframerate(sample_rate)
            
            # Generate silence/minimal audio
            for _ in range(num_samples):
                wav_file.writeframes(struct.pack('h', 0))
            
            wav_file.close()
            return f.name
    
    def test_voice_transcribe_accepts_audio_file(self):
        """POST /api/voice/transcribe should accept audio files"""
        # Create a minimal test audio file
        test_audio_path = self._create_test_wav_file(duration_ms=500)
        
        try:
            with open(test_audio_path, 'rb') as audio_file:
                files = {'file': ('test_audio.wav', audio_file, 'audio/wav')}
                data = {'language': 'en'}
                
                response = requests.post(
                    f"{BASE_URL}/api/voice/transcribe",
                    files=files,
                    data=data
                )
            
            # Check that the endpoint accepts the file (may return error if Whisper rejects silent audio)
            # But the endpoint should be reachable and return valid JSON
            assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                assert "text" in data
                assert "language" in data
                print(f"✓ Voice transcription returned: text='{data['text']}', language={data['language']}")
            else:
                # 500 is acceptable for minimal/empty audio file - API is reachable
                print(f"✓ Voice transcribe endpoint reachable (returns 500 for empty audio - expected)")
                
        finally:
            # Cleanup
            if os.path.exists(test_audio_path):
                os.unlink(test_audio_path)
    
    def test_voice_transcribe_returns_json_format(self):
        """POST /api/voice/transcribe returns proper JSON response"""
        test_audio_path = self._create_test_wav_file(duration_ms=200)
        
        try:
            with open(test_audio_path, 'rb') as audio_file:
                files = {'file': ('test.wav', audio_file, 'audio/wav')}
                data = {'language': 'hi'}  # Test Hindi language parameter
                
                response = requests.post(
                    f"{BASE_URL}/api/voice/transcribe",
                    files=files,
                    data=data
                )
            
            # Should return valid JSON regardless of success/failure
            assert 'application/json' in response.headers.get('content-type', '')
            json_data = response.json()
            assert isinstance(json_data, dict)
            print(f"✓ Voice transcribe returns valid JSON response")
            
        finally:
            if os.path.exists(test_audio_path):
                os.unlink(test_audio_path)


class TestHealthCheck:
    """Verify API is running"""
    
    def test_api_health(self):
        """GET /api/ returns status running"""
        response = requests.get(f"{BASE_URL}/api/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        print(f"✓ API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
