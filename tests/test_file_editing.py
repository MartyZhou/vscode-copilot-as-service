"""
File editing operation tests: add, edit, multiple replacements
"""
import requests
import random
from conftest import TestResults, BASE_URL, TEST_TIMEOUT


def test_file_add_endpoint(results: TestResults):
    """Test /v1/workspace/files/add endpoint"""
    print("\n13a. Testing File Add Endpoint")
    print("-" * 70)
    
    try:
        test_file_path = f"test_add_endpoint_{random.randint(10000, 99999)}.txt"
        test_content = "This is a test file created via API"
        
        # Test adding new file
        response = requests.post(
            f"{BASE_URL}/v1/workspace/files/add",
            json={
                "filePath": test_file_path,
                "content": test_content
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                results.add_pass("Add new file")
            else:
                results.add_fail("Add file", "Success is false")
        else:
            results.add_fail("Add file", f"Status: {response.status_code}")
        
        # Test adding duplicate file without overwrite (should fail)
        response2 = requests.post(
            f"{BASE_URL}/v1/workspace/files/add",
            json={
                "filePath": test_file_path,
                "content": "Different content"
            },
            timeout=10
        )
        
        if response2.status_code == 400:
            results.add_pass("Reject duplicate file without overwrite")
        else:
            results.add_fail("Duplicate handling", f"Expected 400, got {response2.status_code}")
        
        # Test overwriting file
        response3 = requests.post(
            f"{BASE_URL}/v1/workspace/files/add",
            json={
                "filePath": test_file_path,
                "content": "Updated content",
                "overwrite": True
            },
            timeout=10
        )
        
        if response3.status_code == 200:
            data3 = response3.json()
            if data3.get('success'):
                results.add_pass("Overwrite existing file")
            else:
                results.add_fail("Overwrite", "Success is false")
        else:
            results.add_fail("Overwrite", f"Status: {response3.status_code}")
            
    except Exception as e:
        results.add_fail("File add endpoint", str(e))


def test_actual_file_edit_operation(results: TestResults):
    """Test actual file editing with oldString/newString replacement"""
    print("\n14. Testing Actual File Edit Operation")
    print("-" * 70)
    
    try:
        test_file_path = "test_edit_file.txt"
        test_content = "Hello World\nThis is a test file\nGoodbye World"
        
        # Add test file to workspace using API
        add_response = requests.post(
            f"{BASE_URL}/v1/workspace/files/add",
            json={
                "filePath": test_file_path,
                "content": test_content,
                "overwrite": True
            },
            timeout=10
        )
        
        if add_response.status_code != 200:
            results.add_fail("File add", f"Status: {add_response.status_code}")
            return
        
        # Test file edit through fileOperation
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Replace the text in this file"}
                ],
                "fileOperation": {
                    "type": "edit",
                    "filePath": test_file_path,
                    "oldString": "Hello World",
                    "newString": "Greetings Universe"
                }
            },
            timeout=TEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            content = data['choices'][0]['message']['content']
            
            if 'edit' in content.lower() or 'replace' in content.lower() or 'success' in content.lower():
                results.add_pass("File edit operation executed")
                
                # Verify file was actually edited by reading via API
                read_response = requests.post(
                    f"{BASE_URL}/v1/workspace/files/read",
                    json={"filePath": test_file_path},
                    timeout=10
                )
                
                if read_response.status_code == 200:
                    read_data = read_response.json()
                    if 'content' in read_data:
                        file_content = read_data['content']
                        if "Greetings Universe" in file_content and "Hello World" not in file_content:
                            results.add_pass("File content actually modified")
                        else:
                            results.add_fail("File edit", "File content not changed")
                    else:
                        results.add_fail("File read", "No content in response")
                else:
                    results.add_fail("File read", f"Could not verify edit: {read_response.status_code}")
            else:
                results.add_fail("File edit", "No edit confirmation in response")
        else:
            results.add_fail("File edit", f"Status code: {response.status_code}")
            
    except Exception as e:
        results.add_fail("File edit operation", str(e))


def test_search_suggest_actual_edit(results: TestResults):
    """Test complete workflow: search → suggest edit → ACTUALLY edit the file"""
    print("\n15. Testing Search → Suggest → ACTUALLY Edit File")
    print("-" * 70)
    
    try:
        test_file_path = "test_code_file.js"
        test_content = """function hello() {
    console.log('Hello');
    console.log('World');
}
"""
        
        # Add test file to workspace using API
        add_response = requests.post(
            f"{BASE_URL}/v1/workspace/files/add",
            json={
                "filePath": test_file_path,
                "content": test_content,
                "overwrite": True
            },
            timeout=10
        )
        
        if add_response.status_code != 200:
            results.add_fail("File add", f"Status: {add_response.status_code}")
            return
        
        # Step 1: Search for console.log statements
        response1 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": f"Search for console.log in {test_file_path}"}
                ],
                "fileOperation": {
                    "type": "search",
                    "query": "console.log",
                    "maxResults": 10
                },
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response1.status_code != 200:
            results.add_fail("Search for edit targets", f"Status: {response1.status_code}")
            return
        
        results.add_pass("Search finds console.log statements")
        
        # Step 2: Perform actual edit to replace console.log
        response2 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Replace the first console.log with logger.info"}
                ],
                "fileOperation": {
                    "type": "edit",
                    "filePath": test_file_path,
                    "oldString": "    console.log('Hello');",
                    "newString": "    logger.info('Hello');"
                }
            },
            timeout=TEST_TIMEOUT
        )
        
        if response2.status_code == 200:
            # Verify file was actually edited by reading via API
            read_response = requests.post(
                f"{BASE_URL}/v1/workspace/files/read",
                json={"filePath": test_file_path},
                timeout=10
            )
            
            if read_response.status_code == 200:
                read_data = read_response.json()
                if 'content' in read_data:
                    file_content = read_data['content']
                    if "logger.info('Hello')" in file_content:
                        results.add_pass("AI-suggested edit actually modifies file")
                    else:
                        results.add_fail("Actual edit", "File not modified correctly")
                else:
                    results.add_fail("File read", "No content in response")
            else:
                results.add_fail("File read", f"Could not verify edit: {read_response.status_code}")
        else:
            results.add_fail("Execute edit", f"Status: {response2.status_code}")
            
    except Exception as e:
        results.add_fail("Search→Suggest→Edit file", str(e))


def test_multiple_edits_in_file(results: TestResults):
    """Test multiple replacements in a single file edit operation"""
    print("\n16. Testing Multiple Edits in Single Operation")
    print("-" * 70)
    
    try:
        test_file_path = "test_multi_edit.py"
        test_content = """def function1():
    print('test1')
    print('test2')
    print('test3')
"""
        
        # Add test file to workspace using API
        add_response = requests.post(
            f"{BASE_URL}/v1/workspace/files/add",
            json={
                "filePath": test_file_path,
                "content": test_content,
                "overwrite": True
            },
            timeout=10
        )
        
        if add_response.status_code != 200:
            results.add_fail("File add", f"Status: {add_response.status_code}")
            return
        
        # Perform multiple edits at once
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Replace all print statements with logging"}
                ],
                "fileOperation": {
                    "type": "edit",
                    "filePath": test_file_path,
                    "replacements": [
                        {"oldString": "print('test1')", "newString": "logging.info('test1')"},
                        {"oldString": "print('test2')", "newString": "logging.info('test2')"},
                        {"oldString": "print('test3')", "newString": "logging.info('test3')"}
                    ]
                }
            },
            timeout=TEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            content = data['choices'][0]['message']['content']
            
            if 'replacement' in content.lower() or 'edit' in content.lower():
                results.add_pass("Multiple edits executed")
            
            # Verify actual file changes by reading via API
            read_response = requests.post(
                f"{BASE_URL}/v1/workspace/files/read",
                json={"filePath": test_file_path},
                timeout=10
            )
            
            if read_response.status_code == 200:
                read_data = read_response.json()
                if 'content' in read_data:
                    file_content = read_data['content']
                    edits_correct = (
                        "logging.info('test1')" in file_content and
                        "logging.info('test2')" in file_content and
                        "logging.info('test3')" in file_content and
                        "print('test1')" not in file_content and
                        "print('test2')" not in file_content and
                        "print('test3')" not in file_content
                    )
                    
                    if edits_correct:
                        results.add_pass("All replacements applied correctly")
                    else:
                        results.add_fail("Multiple edits", "Some replacements not applied")
                else:
                    results.add_fail("File read", "No content in response")
            else:
                results.add_fail("File read", f"Could not verify edits: {read_response.status_code}")
        else:
            results.add_fail("Multiple edits", f"Status: {response.status_code}")
            
    except Exception as e:
        results.add_fail("Multiple edits", str(e))


def run_file_editing_tests():
    """Run all file editing tests"""
    results = TestResults()
    
    test_file_add_endpoint(results)
    test_actual_file_edit_operation(results)
    test_search_suggest_actual_edit(results)
    test_multiple_edits_in_file(results)
    
    return results


if __name__ == "__main__":
    run_file_editing_tests()
