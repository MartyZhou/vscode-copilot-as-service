"""
Example Python client for VS Code Copilot as Service
"""
import requests
import json

BASE_URL = "http://localhost:8765"

def chat_completion(messages, model="gpt-5-mini", stream=False, include_workspace_context=True, justification=None, tools=None):
    """
    Send a chat completion request to the Copilot service.
    
    Args:
        messages: List of message dictionaries with 'role' and 'content'
        model: The model to use (default: gpt-5-mini)
        stream: Whether to stream the response (default: False)
               Note: Streaming is automatically disabled when tools are provided
        include_workspace_context: Include VS Code workspace context (default: True)
        justification: Optional justification for the request
        tools: Optional list of tool names (strings) or full tool definitions
               When provided, the service will automatically invoke tools and return the final result
    """
    url = f"{BASE_URL}/v1/chat/completions"
    
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "includeWorkspaceContext": include_workspace_context,
        "tools": tools or []
    }
    
    if justification:
        payload["justification"] = justification
    
    if stream:
        response = requests.post(url, json=payload, stream=True)
        response.raise_for_status()
        
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data != '[DONE]':
                        chunk = json.loads(data)
                        content = chunk['choices'][0]['delta'].get('content', '')
                        if content:
                            print(content, end='', flush=True)
        print()
    else:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        result = response.json()
        return result['choices'][0]['message']['content']

def list_models():
    """List available models."""
    url = f"{BASE_URL}/v1/models"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def list_tools():
    """List available tools."""
    url = f"{BASE_URL}/v1/tools"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def health_check():
    """Check if the service is running."""
    url = f"{BASE_URL}/health"
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}

def invoke_tool(tool_name, parameters=None):
    """
    Invoke a tool by name with parameters.
    
    Args:
        tool_name: Name of the tool to invoke
        parameters: Dictionary of parameters for the tool
    
    Returns:
        The tool result
    """
    url = f"{BASE_URL}/v1/tools/invoke"
    payload = {
        "tool_name": tool_name,
        "parameters": parameters or {}
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()

def open_file(file_path, line=None):
    """
    Open a file in VS Code editor.
    
    Args:
        file_path: Path to the file (relative or absolute)
        line: Optional line number to navigate to
    
    Returns:
        Result of the operation
    """
    url = f"{BASE_URL}/v1/workspace/files/open"
    payload = {
        "filePath": file_path,
    }
    if line is not None:
        payload["line"] = line
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()

def search_workspace(query, file_pattern=None, max_results=20):
    """
    Search for code in the workspace.
    
    Args:
        query: Search query string
        file_pattern: Optional glob pattern to filter files (e.g., "**/*.py")
        max_results: Maximum number of results to return
    
    Returns:
        Search results
    """
    url = f"{BASE_URL}/v1/workspace/files/search"
    payload = {
        "query": query,
        "maxResults": max_results
    }
    if file_pattern:
        payload["filePattern"] = file_pattern
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()

def chat_with_files(messages, file_reads=None, code_search=None, model="gpt-5-mini", include_workspace_context=False):
    """
    Send a chat completion request with file content and/or code search results.
    
    Args:
        messages: List of message dictionaries with 'role' and 'content'
        file_reads: Optional list of file paths to include in context
        code_search: Optional dict with 'query', 'filePattern', 'maxResults' for code search
        model: The model to use
        include_workspace_context: Include general workspace context
    
    Returns:
        The assistant's response
    """
    url = f"{BASE_URL}/v1/chat/completions"
    
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "includeWorkspaceContext": include_workspace_context
    }
    
    if file_reads:
        payload["fileReads"] = file_reads
    
    if code_search:
        payload["codeSearch"] = code_search
    
    response = requests.post(url, json=payload)
    response.raise_for_status()
    result = response.json()
    return result['choices'][0]['message']['content']
