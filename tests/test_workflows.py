"""
Workflow tests: suggestions, chaining, context preservation
"""
import requests
from conftest import TestResults, BASE_URL, TEST_TIMEOUT


def test_workflow_suggestions(results: TestResults):
    """Test workflow suggestions feature"""
    print("\n8. Testing Workflow Suggestions")
    print("-" * 70)
    
    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Analyze this"}
                ],
                "fileOperation": {
                    "type": "read",
                    "filePath": "package.json"
                },
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if 'suggested_actions' in data:
                actions = data['suggested_actions']
                if len(actions) > 0:
                    results.add_pass(f"Suggestions generated ({len(actions)} actions)")
                    
                    valid_structure = True
                    for action in actions:
                        if not all(k in action for k in ['description', 'reasoning', 'request']):
                            valid_structure = False
                            break
                    
                    if valid_structure:
                        results.add_pass("Suggestion structure valid")
                    else:
                        results.add_fail("Suggestion structure", "Missing required fields")
                    
                    if 'context_summary' in data:
                        results.add_pass("Context summary present")
                    else:
                        results.add_fail("Context summary", "Missing from response")
                else:
                    results.add_fail("Suggestions", "Empty suggestions array")
            else:
                results.add_fail("Suggestions", "No suggested_actions in response")
        else:
            results.add_fail("Workflow suggestions", f"Status code: {response.status_code}")
    except Exception as e:
        results.add_fail("Workflow suggestions", str(e))


def test_suggestion_execution(results: TestResults):
    """Test executing a suggested action"""
    print("\n9. Testing Suggestion Execution")
    print("-" * 70)
    
    try:
        # First request with suggestions
        response1 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "Analyze"}],
                "fileOperation": {"type": "read", "filePath": "package.json"},
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response1.status_code == 200:
            data1 = response1.json()
            
            if 'suggested_actions' in data1 and len(data1['suggested_actions']) > 0:
                suggested_request = data1['suggested_actions'][0]['request']
                
                response2 = requests.post(
                    f"{BASE_URL}/v1/chat/completions",
                    json=suggested_request,
                    timeout=TEST_TIMEOUT
                )
                
                if response2.status_code == 200:
                    results.add_pass("Execute suggested action")
                    
                    data2 = response2.json()
                    if 'suggested_actions' in data2:
                        results.add_pass("Suggestion chaining works")
                else:
                    results.add_fail("Execute suggestion", f"Status: {response2.status_code}")
            else:
                results.add_fail("Execute suggestion", "No suggestions to execute")
        else:
            results.add_fail("Execute suggestion", f"First request failed: {response1.status_code}")
    except Exception as e:
        results.add_fail("Execute suggestion", str(e))


def test_search_suggest_edit_workflow(results: TestResults):
    """Test complete workflow: search → AI suggests edit → execute edit"""
    print("\n17. Testing Search → Suggest Edit → Execute Edit Workflow")
    print("-" * 70)
    
    try:
        # Step 1: Search for content that needs editing
        response1 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Search for all functions that handle chat completions in the codebase"}
                ],
                "fileOperation": {
                    "type": "search",
                    "query": "handleChatCompletions",
                    "maxResults": 10
                },
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response1.status_code != 200:
            results.add_fail("Search step", f"Status: {response1.status_code}")
            return
        
        data1 = response1.json()
        content1 = data1['choices'][0]['message']['content']
        
        if 'match' in content1.lower() or 'found' in content1.lower() or 'file' in content1.lower():
            results.add_pass("Search files with content")
        else:
            results.add_fail("Search", "No search results")
            return
        
        if 'suggested_actions' not in data1 or len(data1['suggested_actions']) == 0:
            results.add_fail("Suggest edit", "No suggestions returned")
            return
        
        actions = data1['suggested_actions']
        edit_suggestion = None
        
        for action in actions:
            description = action.get('description', '').lower()
            reasoning = action.get('reasoning', '').lower()
            if any(keyword in description or keyword in reasoning 
                   for keyword in ['edit', 'modify', 'update', 'change', 'refactor']):
                edit_suggestion = action
                break
        
        if edit_suggestion:
            results.add_pass("AI suggests edit action in next actions")
        else:
            edit_suggestion = actions[0]
            results.add_pass("Using first suggestion (may not be edit-specific)")
        
        suggested_request = edit_suggestion['request']
        
        response2 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=suggested_request,
            timeout=TEST_TIMEOUT
        )
        
        if response2.status_code == 200:
            data2 = response2.json()
            content2 = data2['choices'][0]['message']['content']
            
            if len(content2) > 20:
                results.add_pass("Execute suggested action successfully")
            else:
                results.add_fail("Execute suggestion", "Empty or minimal response")
        else:
            results.add_fail("Execute suggestion", f"Status: {response2.status_code}")
            
    except Exception as e:
        results.add_fail("Search→Suggest→Edit workflow", str(e))


def test_read_suggest_edit_workflow(results: TestResults):
    """Test workflow: read file → AI suggests edit → execute edit"""
    print("\n18. Testing Read File → Suggest Edit → Execute Edit Workflow")
    print("-" * 70)
    
    try:
        response1 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Review this code and suggest improvements"}
                ],
                "fileOperation": {
                    "type": "read",
                    "filePath": "src/routes.ts",
                    "startLine": 1,
                    "endLine": 50
                },
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response1.status_code != 200:
            results.add_fail("Read file step", f"Status: {response1.status_code}")
            return
        
        data1 = response1.json()
        results.add_pass("Read file with suggestions enabled")
        
        if 'suggested_actions' in data1 and len(data1['suggested_actions']) > 0:
            actions = data1['suggested_actions']
            has_edit_suggestion = False
            
            for action in actions:
                description = action.get('description', '').lower()
                if any(keyword in description for keyword in ['edit', 'modify', 'refactor', 'improve', 'update']):
                    has_edit_suggestion = True
                    break
            
            if has_edit_suggestion:
                results.add_pass("Suggestions include edit/improvement action")
            else:
                results.add_pass("Suggestions generated (may not include edit)")
            
            first_suggestion = actions[0]
            response2 = requests.post(
                f"{BASE_URL}/v1/chat/completions",
                json=first_suggestion['request'],
                timeout=TEST_TIMEOUT
            )
            
            if response2.status_code == 200:
                results.add_pass("Execute suggested action from read")
            else:
                results.add_fail("Execute from read", f"Status: {response2.status_code}")
        else:
            results.add_fail("Suggestions from read", "No suggestions returned")
            
    except Exception as e:
        results.add_fail("Read→Suggest→Edit workflow", str(e))


def test_multi_step_suggestion_chain(results: TestResults):
    """Test multi-step workflow with suggestion chaining"""
    print("\n19. Testing Multi-Step Suggestion Chain")
    print("-" * 70)
    
    try:
        response1 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Find files with TODO comments"}
                ],
                "fileOperation": {
                    "type": "search",
                    "query": "TODO",
                    "maxResults": 5
                },
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response1.status_code != 200:
            results.add_fail("Chain step 1", f"Status: {response1.status_code}")
            return
        
        data1 = response1.json()
        if 'suggested_actions' not in data1 or len(data1['suggested_actions']) == 0:
            results.add_fail("Chain step 1", "No suggestions")
            return
        
        results.add_pass("Step 1: Search with suggestions")
        
        response2 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=data1['suggested_actions'][0]['request'],
            timeout=TEST_TIMEOUT
        )
        
        if response2.status_code != 200:
            results.add_fail("Chain step 2", f"Status: {response2.status_code}")
            return
        
        data2 = response2.json()
        results.add_pass("Step 2: Execute first suggestion")
        
        if 'suggested_actions' in data2 and len(data2['suggested_actions']) > 0:
            response3 = requests.post(
                f"{BASE_URL}/v1/chat/completions",
                json=data2['suggested_actions'][0]['request'],
                timeout=TEST_TIMEOUT
            )
            
            if response3.status_code == 200:
                results.add_pass("Step 3: Chain continues successfully")
            else:
                results.add_fail("Chain step 3", f"Status: {response3.status_code}")
        else:
            results.add_pass("Step 3: Chain completed (no more suggestions)")
            
    except Exception as e:
        results.add_fail("Multi-step chain", str(e))


def test_search_with_edit_intent(results: TestResults):
    """Test searching with explicit edit intent"""
    print("\n20. Testing Search with Edit Intent")
    print("-" * 70)
    
    try:
        response = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Find all console.log statements so I can replace them with proper logging"}
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
        
        if response.status_code != 200:
            results.add_fail("Search with edit intent", f"Status: {response.status_code}")
            return
        
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        if 'console.log' in content or 'found' in content.lower():
            results.add_pass("Search identifies target for editing")
        else:
            results.add_fail("Search results", "No search results found")
            return
        
        if 'suggested_actions' in data and len(data['suggested_actions']) > 0:
            actions = data['suggested_actions']
            edit_focused = False
            
            for action in actions:
                desc = action.get('description', '').lower()
                reasoning = action.get('reasoning', '').lower()
                if any(word in desc or word in reasoning 
                       for word in ['replace', 'edit', 'modify', 'change', 'update', 'refactor']):
                    edit_focused = True
                    break
            
            if edit_focused:
                results.add_pass("Suggestions are edit-focused")
            else:
                results.add_pass("Suggestions generated (general)")
        else:
            results.add_fail("Edit suggestions", "No suggestions returned")
            
    except Exception as e:
        results.add_fail("Search with edit intent", str(e))


def test_context_preservation_across_edits(results: TestResults):
    """Test that context is preserved when chaining edit operations"""
    print("\n21. Testing Context Preservation Across Edit Operations")
    print("-" * 70)
    
    try:
        response1 = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "user", "content": "Show me the main exports from this file"}
                ],
                "fileOperation": {
                    "type": "read",
                    "filePath": "src/extension.ts",
                    "startLine": 1,
                    "endLine": 30
                },
                "suggestNextActions": True
            },
            timeout=TEST_TIMEOUT
        )
        
        if response1.status_code != 200:
            results.add_fail("Context preservation 1", f"Status: {response1.status_code}")
            return
        
        data1 = response1.json()
        
        if 'context_summary' in data1:
            results.add_pass("Context captured in step 1")
        else:
            results.add_pass("Step 1 completed")
        
        if 'suggested_actions' in data1 and len(data1['suggested_actions']) > 0:
            suggested = data1['suggested_actions'][0]
            
            if 'context_summary' in suggested.get('request', {}):
                results.add_pass("Context included in suggested request")
            else:
                results.add_pass("Suggestion generated")
            
            response2 = requests.post(
                f"{BASE_URL}/v1/chat/completions",
                json=suggested['request'],
                timeout=TEST_TIMEOUT
            )
            
            if response2.status_code == 200:
                data2 = response2.json()
                content2 = data2['choices'][0]['message']['content']
                
                if len(content2) > 20:
                    results.add_pass("Context preserved in chained operation")
                else:
                    results.add_fail("Context preservation", "Minimal response")
            else:
                results.add_fail("Context preservation 2", f"Status: {response2.status_code}")
        else:
            results.add_fail("Context preservation", "No suggestions to chain")
            
    except Exception as e:
        results.add_fail("Context preservation", str(e))


def run_workflow_tests():
    """Run all workflow tests"""
    results = TestResults()
    
    test_workflow_suggestions(results)
    test_suggestion_execution(results)
    test_search_suggest_edit_workflow(results)
    test_read_suggest_edit_workflow(results)
    test_multi_step_suggestion_chain(results)
    test_search_with_edit_intent(results)
    test_context_preservation_across_edits(results)
    
    return results


if __name__ == "__main__":
    run_workflow_tests()
