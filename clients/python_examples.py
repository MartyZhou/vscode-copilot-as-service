
if __name__ == "__main__":
    # Make imports robust: ensure `clients/` and repo root are on sys.path
    import os
    import sys

    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

    # Import client helpers (local module in same directory)
    from python_client import (
        health_check,
        list_models,
        list_tools,
        chat_completion
    )

    # Check health
    print("Checking service health...")
    health = health_check()
    print(f"Health: {health}\n")
    
    # List models
    print("Available models:")
    models = list_models()
    for model in models['data']:
        print(f"  - {model['id']}")
    print()

    # print("Available tools:")
    tools = list_tools()
    for tool in tools['data']:
        print(f"  - {tool['name']}: {tool['description']}")
    print()
    
    # Workspace-aware question (with context)
    print("Workspace-aware question (with context):")
    messages = [
        {"role": "user", "content": "Describe the structure of this project"}
    ]
    response = chat_completion(
        messages, 
        model="gpt-5-mini",
        include_workspace_context=True,
        justification="Project analysis via Python API"
    )
    print(response)
    print()
