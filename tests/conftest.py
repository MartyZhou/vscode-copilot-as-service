"""
Shared test configuration and utilities for VS Code Copilot as Service tests
"""
import requests

BASE_URL = "http://localhost:8765"
TEST_TIMEOUT = 30


class TestResults:
    """Tracks test pass/fail results"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def add_pass(self, test_name: str):
        self.passed += 1
        print(f"  ✓ {test_name}")
    
    def add_fail(self, test_name: str, error: str):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"  ✗ {test_name}: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*70}")
        print(f"Test Results: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"\nFailed Tests:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*70}")
        return self.failed == 0


def check_server():
    """Verify server is running and responding"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code != 200:
            print("\n❌ ERROR: Server is not responding correctly")
            print("Make sure the VS Code extension is running in debug mode")
            return False
    except Exception as e:
        print(f"\n❌ ERROR: Cannot connect to server: {e}")
        print("Make sure the VS Code extension is running in debug mode")
        return False
    return True
