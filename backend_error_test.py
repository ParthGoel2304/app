#!/usr/bin/env python3

import requests
import json
import sys

# Backend URL from review request
BACKEND_URL = "https://drive-quotation-app.preview.emergentagent.com"

def test_error_scenarios():
    """Test error handling scenarios"""
    
    print("🧪 Testing Error Scenarios")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    
    # Test 1: Invalid session_id for OAuth connect
    print(f"\n{'='*80}")
    print("ERROR TEST 1: OAuth Connect with Invalid Session ID")
    try:
        response = requests.get(f"{BACKEND_URL}/api/oauth/drive/connect", 
                              params={'session_id': 'invalid-session-id'}, 
                              timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 404:
            print("✅ PASS: Correctly returns 404 for invalid session")
            test_results.append(('Invalid Session OAuth', True))
        else:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
            test_results.append(('Invalid Session OAuth', False))
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        test_results.append(('Invalid Session OAuth', False))
    
    # Test 2: Drive status with invalid session
    print(f"\n{'='*80}")
    print("ERROR TEST 2: Drive Status with Invalid Session ID")
    try:
        response = requests.get(f"{BACKEND_URL}/api/drive/status", 
                              params={'session_id': 'invalid-session-id'}, 
                              timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        # Drive status should return connected: false for any session (even invalid ones)
        if response.status_code == 200:
            try:
                data = response.json()
                if data.get('connected') is False:
                    print("✅ PASS: Correctly returns connected: false")
                    test_results.append(('Invalid Session Drive Status', True))
                else:
                    print(f"❌ FAIL: Expected connected: false, got {data}")
                    test_results.append(('Invalid Session Drive Status', False))
            except:
                print("❌ FAIL: Could not parse JSON response")
                test_results.append(('Invalid Session Drive Status', False))
        else:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            test_results.append(('Invalid Session Drive Status', False))
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        test_results.append(('Invalid Session Drive Status', False))
    
    # Test 3: Missing session_id parameter
    print(f"\n{'='*80}")
    print("ERROR TEST 3: OAuth Connect without Session ID")
    try:
        response = requests.get(f"{BACKEND_URL}/api/oauth/drive/connect", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 422:  # Validation error
            print("✅ PASS: Correctly returns 422 for missing required parameter")
            test_results.append(('Missing Session Parameter', True))
        else:
            print(f"❌ FAIL: Expected 422, got {response.status_code}")
            test_results.append(('Missing Session Parameter', False))
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        test_results.append(('Missing Session Parameter', False))
    
    # Test 4: Test non-existent endpoint
    print(f"\n{'='*80}")
    print("ERROR TEST 4: Non-existent Endpoint")
    try:
        response = requests.get(f"{BACKEND_URL}/api/nonexistent", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 404:
            print("✅ PASS: Correctly returns 404 for non-existent endpoint")
            test_results.append(('Non-existent Endpoint', True))
        else:
            print(f"❌ FAIL: Expected 404, got {response.status_code}")
            test_results.append(('Non-existent Endpoint', False))
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        test_results.append(('Non-existent Endpoint', False))
    
    # Print Summary
    print(f"\n{'='*80}")
    print("🔍 ERROR TEST SUMMARY")
    print(f"{'='*80}")
    
    passed = 0
    total = len(test_results)
    
    for test_name, success in test_results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{test_name}: {status}")
        if success:
            passed += 1
    
    print(f"\nError Tests Results: {passed}/{total} tests passed")
    
    return passed == total

if __name__ == "__main__":
    success = test_error_scenarios()
    sys.exit(0 if success else 1)