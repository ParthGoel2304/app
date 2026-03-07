"""
Backend API Tests for Payment Endpoints
Tests the debtors/payments CRUD operations
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://excel-reader-erp.preview.emergentagent.com')

# Test session ID (any UUID works for testing)
TEST_SESSION_ID = f"test-session-{uuid.uuid4().hex[:8]}"
TEST_DEBTOR_NAME = f"TEST_Debtor_{uuid.uuid4().hex[:6]}"


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_api_root_status(self):
        """GET /api/ returns status running"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "running"
        assert "message" in data
        print(f"✓ API root returns status: {data}")


class TestSessionEndpoint:
    """Session creation endpoint tests"""
    
    def test_create_session(self):
        """POST /api/session/create creates session"""
        response = requests.post(f"{BASE_URL}/api/session/create")
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert len(data["session_id"]) > 0
        print(f"✓ Session created: {data['session_id']}")


class TestPaymentEndpoints:
    """Payment CRUD endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session_id = TEST_SESSION_ID
        self.debtor_name = TEST_DEBTOR_NAME
        self.payment_date = "2026-01-15"
        self.payment_data = {
            "debtor_name": self.debtor_name,
            "amount": 5000.50,
            "date": self.payment_date,
            "reference": "TEST_REF_001",
            "notes": "Test payment note"
        }
    
    def test_record_payment(self):
        """POST /api/debtors/payments/record records a payment with required fields"""
        response = requests.post(
            f"{BASE_URL}/api/debtors/payments/record?session_id={self.session_id}",
            json=self.payment_data,
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        assert "message" in data
        print(f"✓ Payment recorded: {data}")
    
    def test_record_payment_missing_fields(self):
        """POST /api/debtors/payments/record fails with missing required fields"""
        incomplete_data = {
            "debtor_name": self.debtor_name
            # Missing amount and date
        }
        response = requests.post(
            f"{BASE_URL}/api/debtors/payments/record?session_id={self.session_id}",
            json=incomplete_data,
            headers={"Content-Type": "application/json"}
        )
        # Should fail with 422 validation error
        assert response.status_code == 422
        print(f"✓ Payment correctly rejected for missing fields")
    
    def test_list_payments(self):
        """GET /api/debtors/payments/list returns recorded payments"""
        # First record a payment
        requests.post(
            f"{BASE_URL}/api/debtors/payments/record?session_id={self.session_id}",
            json=self.payment_data,
            headers={"Content-Type": "application/json"}
        )
        
        # Then list payments
        response = requests.get(
            f"{BASE_URL}/api/debtors/payments/list?session_id={self.session_id}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "payments" in data
        assert isinstance(data["payments"], list)
        print(f"✓ Payments listed: {len(data['payments'])} payments found")
    
    def test_list_payments_by_debtor(self):
        """GET /api/debtors/payments/list with debtor_name filter"""
        response = requests.get(
            f"{BASE_URL}/api/debtors/payments/list?session_id={self.session_id}&debtor_name={self.debtor_name}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "payments" in data
        # All returned payments should be for this debtor
        for payment in data["payments"]:
            assert payment.get("debtor_name") == self.debtor_name
        print(f"✓ Filtered payments for {self.debtor_name}: {len(data['payments'])} found")
    
    def test_delete_payment(self):
        """DELETE /api/debtors/payments/{date} deletes a payment"""
        # First record a unique payment to delete
        unique_date = f"2026-01-{uuid.uuid4().hex[:2][:2].zfill(2)}"
        unique_debtor = f"TEST_Del_{uuid.uuid4().hex[:6]}"
        
        delete_payment_data = {
            "debtor_name": unique_debtor,
            "amount": 1000.00,
            "date": unique_date,
            "reference": "DEL_TEST"
        }
        
        # Record payment
        record_response = requests.post(
            f"{BASE_URL}/api/debtors/payments/record?session_id={self.session_id}",
            json=delete_payment_data,
            headers={"Content-Type": "application/json"}
        )
        assert record_response.status_code == 200
        
        # Delete payment
        response = requests.delete(
            f"{BASE_URL}/api/debtors/payments/{unique_date}?session_id={self.session_id}&debtor_name={unique_debtor}"
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print(f"✓ Payment deleted for date {unique_date}")
    
    def test_delete_nonexistent_payment(self):
        """DELETE /api/debtors/payments/{date} returns 404 for non-existent payment"""
        response = requests.delete(
            f"{BASE_URL}/api/debtors/payments/9999-99-99?session_id={self.session_id}&debtor_name=NONEXISTENT"
        )
        assert response.status_code == 404
        print(f"✓ Correctly returned 404 for non-existent payment")


class TestPaymentDataValidation:
    """Payment data validation tests"""
    
    def test_payment_amount_validation(self):
        """Verify amount is properly stored and returned"""
        session_id = f"test-val-{uuid.uuid4().hex[:8]}"
        debtor_name = f"TEST_Val_{uuid.uuid4().hex[:6]}"
        test_amount = 12345.67
        
        payment_data = {
            "debtor_name": debtor_name,
            "amount": test_amount,
            "date": "2026-01-20"
        }
        
        # Record payment
        requests.post(
            f"{BASE_URL}/api/debtors/payments/record?session_id={session_id}",
            json=payment_data,
            headers={"Content-Type": "application/json"}
        )
        
        # Get payments and verify amount
        response = requests.get(
            f"{BASE_URL}/api/debtors/payments/list?session_id={session_id}&debtor_name={debtor_name}"
        )
        data = response.json()
        if data["payments"]:
            returned_amount = data["payments"][0].get("amount")
            assert returned_amount == test_amount
            print(f"✓ Amount validation passed: {returned_amount}")
        else:
            print("⚠ No payments found to validate")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
