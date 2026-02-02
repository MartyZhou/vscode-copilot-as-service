"""
Master test runner for all integration tests
Runs all test modules and aggregates results
"""
import sys

from conftest import check_server, TestResults

# Import all test modules
from test_basic_endpoints import run_basic_tests
from test_file_operations import run_file_operation_tests
from test_file_editing import run_file_editing_tests
from test_workflows import run_workflow_tests


def run_all_tests():
    """Run all integration tests from all modules"""
    print("="*70)
    print("VS CODE COPILOT AS SERVICE - COMPREHENSIVE INTEGRATION TESTS")
    print("="*70)
    print(f"\nTesting server at: http://localhost:8765")
    print(f"Test timeout: 30s")
    
    # Check if server is running
    if not check_server():
        return False
    
    # Run all test modules
    print("\n" + "="*70)
    print("Running Basic Endpoint Tests")
    print("="*70)
    results_basic = run_basic_tests()
    
    print("\n" + "="*70)
    print("Running File Operation Tests")
    print("="*70)
    results_file_ops = run_file_operation_tests()
    
    print("\n" + "="*70)
    print("Running File Editing Tests")
    print("="*70)
    results_file_edit = run_file_editing_tests()
    
    print("\n" + "="*70)
    print("Running Workflow Tests")
    print("="*70)
    results_workflows = run_workflow_tests()
    
    # Aggregate results
    total_passed = (
        results_basic.passed + 
        results_file_ops.passed + 
        results_file_edit.passed + 
        results_workflows.passed
    )
    total_failed = (
        results_basic.failed + 
        results_file_ops.failed + 
        results_file_edit.failed + 
        results_workflows.failed
    )
    total = total_passed + total_failed
    
    # Print final summary
    print("\n" + "="*70)
    print("FINAL TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {total}")
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_failed}")
    
    if total_failed > 0:
        print(f"\nFailed Tests:")
        for error in (results_basic.errors + results_file_ops.errors + 
                     results_file_edit.errors + results_workflows.errors):
            print(f"  - {error}")
        print(f"\n❌ {total_failed} TEST(S) FAILED")
    else:
        print(f"\n✅ ALL TESTS PASSED!")
    
    print("="*70)
    
    return total_failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
