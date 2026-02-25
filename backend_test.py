#!/usr/bin/env python3

import requests
import json
import sys
from urllib.parse import urlparse

# Backend URL from review request
BACKEND_URL = "https://smart-excel-reader.preview.emergentagent.com"

def test_endpoint(method, endpoint, expected_status=200, json_data=None, params=None):
    """Helper function to test an endpoint"""
    url = f"{BACKEND_URL}{endpoint}"
    
    print(f"\n{'='*60}")
    print(f"Testing: {method.upper()} {url}")
    if params:
        print(f"Params: {params}")
    if json_data:
        print(f"JSON Data: {json_data}")
    
    try:
        if method.upper() == 'GET':
            response = requests.get(url, params=params, timeout=10)
        elif method.upper() == 'POST':
            response = requests.post(url, json=json_data, params=params, timeout=10)
        else:
            print(f"❌ Unsupported method: {method}")
            return False
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        # Try to parse response as JSON
        try:
            response_json = response.json()
            print(f"Response JSON: {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response Text: {response.text[:500]}")
        
        # Check if status code matches expected
        if response.status_code == expected_status:
            print(f"✅ PASS: Expected status {expected_status}")
            return True, response
        else:
            print(f"❌ FAIL: Expected status {expected_status}, got {response.status_code}")
            return False, response
            
    except requests.exceptions.RequestException as e:
        print(f"❌ REQUEST ERROR: {str(e)}")
        return False, None
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {str(e)}")
        return False, None

def main():
    """Run all backend API tests"""
    
    print("🚀 Starting Excel Reader Backend API Tests")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    session_id = None
    
    # Test 1: Root Endpoint
    print(f"\n{'='*80}")
    print("TEST 1: Root Endpoint")
    success, response = test_endpoint('GET', '/api/')
    test_results.append(('Root Endpoint', success))
    
    # Test 2: Session Creation
    print(f"\n{'='*80}")
    print("TEST 2: Session Creation")
    success, response = test_endpoint('POST', '/api/session/create')
    test_results.append(('Session Creation', success))
    
    # Extract session_id if successful
    if success and response:
        try:
            response_data = response.json()
            session_id = response_data.get('session_id')
            print(f"📝 Extracted session_id: {session_id}")
        except:
            print("❌ Failed to extract session_id from response")
    
    # Test 3: OAuth Connect Endpoint
    print(f"\n{'='*80}")
    print("TEST 3: OAuth Connect Endpoint")
    if session_id:
        success, response = test_endpoint('GET', '/api/oauth/drive/connect', params={'session_id': session_id})
        test_results.append(('OAuth Connect', success))
        
        # Verify authorization_url format
        if success and response:
            try:
                response_data = response.json()
                auth_url = response_data.get('authorization_url')
                if auth_url:
                    parsed = urlparse(auth_url)
                    if 'accounts.google.com' in parsed.netloc:
                        print(f"✅ Valid Google authorization URL format")
                    else:
                        print(f"❌ Invalid authorization URL domain: {parsed.netloc}")
                else:
                    print(f"❌ No authorization_url in response")
            except:
                print(f"❌ Failed to parse OAuth response")
    else:
        print("❌ Skipping OAuth test - no session_id available")
        test_results.append(('OAuth Connect', False))
    
    # Test 4: Drive Status (Not Connected)
    print(f"\n{'='*80}")
    print("TEST 4: Drive Status (Not Connected)")
    if session_id:
        success, response = test_endpoint('GET', '/api/drive/status', params={'session_id': session_id})
        test_results.append(('Drive Status', success))
        
        # Verify connected: false
        if success and response:
            try:
                response_data = response.json()
                connected = response_data.get('connected')
                if connected is False:
                    print(f"✅ Correctly shows not connected: {connected}")
                else:
                    print(f"❌ Expected connected: false, got: {connected}")
            except:
                print(f"❌ Failed to parse drive status response")
    else:
        print("❌ Skipping Drive Status test - no session_id available")
        test_results.append(('Drive Status', False))
    
    # Print Summary
    print(f"\n{'='*80}")
    print("🔍 TEST SUMMARY")
    print(f"{'='*80}")
    
    passed = 0
    total = len(test_results)
    
    for test_name, success in test_results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{test_name}: {status}")
        if success:
            passed += 1
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests PASSED!")
        return True
    else:
        print(f"❌ {total - passed} test(s) FAILED")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)