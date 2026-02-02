"""
Basic endpoint tests: health, models, tools, basic chat
"""
import requests
from conftest import TestResults, BASE_URL, TEST_TIMEOUT


def test_health_endpoint(results: TestResults):
    """Test /health endpoint"""
    print("\n1. Testing Health Endpoint")
    print("-" * 70)
    
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'ok':
                results.add_pass("Health check")
            else:
                results.add_fail("Health check", f"Unexpected status: {data}")
        else:
            results.add_fail("Health check", f"Status code: {response.status_code}")
    except Exception as e:
        results.add_fail("Health check", str(e))


def test_models_endpoint(results: TestResults):
    """Test /v1/models endpoint"""
    print("\n2. Testing Models Endpoint")
    print("-" * 70)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/models", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if 'data' in data and isinstance(data['data'], list):
                results.add_pass(f"List models ({len(data['data'])} models)")
                if len(data['data']) > 0:
                    model = data['data'][0]
                    if 'id' in model and 'name' in model:
                        results.add_pass("Model structure valid")
                    else:
                        results.add_fail("Model structure", "Missing required fields")
            else:
                results.add_fail("List models", "Invalid response structure")
        else:
            results.add_fail("List models", f"Status code: {response.status_code}")
    except Exception as e:
        results.add_fail("List models", str(e))


def test_basic_chat(results: TestResults):
    """Test basic chat completion"""
    print("\n3. Testing Basic Chat Completions")
    print("-" * 70)
    
    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "What is 2+2? Answer with just the number."}
                ]
            },
            timeout=TEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'choices' in data and len(data['choices']) > 0:
                content = data['choices'][0]['message']['content']
                results.add_pass(f"Basic chat ({content[:50]}...)")
            else:
                results.add_fail("Basic chat", "No choices in response")
        else:
            results.add_fail("Basic chat", f"Status code: {response.status_code}")
    except Exception as e:
        results.add_fail("Basic chat", str(e))


def test_tools_endpoint(results: TestResults):
    """Test /v1/tools endpoint"""
    print("\n22. Testing Tools Endpoint")
    print("-" * 70)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/tools", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                results.add_pass(f"List tools ({len(data.get('data', []))} tools)")
            else:
                results.add_fail("List tools", "Invalid response structure")
        else:
            results.add_fail("List tools", f"Status code: {response.status_code}")
    except Exception as e:
        results.add_fail("List tools", str(e))


def run_basic_tests():
    """Run all basic endpoint tests"""
    results = TestResults()
    
    test_health_endpoint(results)
    test_models_endpoint(results)
    test_basic_chat(results)
    test_tools_endpoint(results)
    
    return results


if __name__ == "__main__":
    run_basic_tests()
