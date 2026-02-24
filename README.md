# VS Code Copilot as Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/MartyZhou.vscode-copilot-as-service?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)

**Expose GitHub Copilot as an OpenAI-compatible HTTP API with intelligent file operations and workflow suggestions.**

This VS Code extension provides programmatic access to GitHub Copilot through a REST API, with built-in file operations and AI-powered workflow suggestions for uninterrupted development.

## Key Features

- **OpenAI-Compatible API** - Drop-in replacement for OpenAI endpoints
- **Automatic Tool Invocation** - Tools execute automatically with results
- **Workspace Integration** - Include VS Code context in requests
- **Workflow Suggestions** - AI suggests next logical actions automatically
- **Integrated File Operations** - Read, edit, search, and open files through chat
- **Ollama subset APIs** - Integrate with tools like langflow or OpenClaw as a local ollama server

## Quick Start

### Installation

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MartyZhou.vscode-copilot-as-service)

**Requirements:** Active GitHub Copilot subscription

### Basic Usage

```python
import requests

response = requests.post('http://localhost:8765/v1/chat/completions', json={
    'messages': [{'role': 'user', 'content': 'Explain this project briefly.'}]
})

print(response.json()['choices'][0]['message']['content'])
```

### Advanced Usage
- `tests/integration.test.mjs` covers essential APIs end to end:
  - `/health`, `/v1/models`, `/v1/chat/completions`
  - `/v1/tools`, `/v1/tools/invoke`
  - chat-completion tool-calling with VS Code built-in `fileSearch`
  - `/v1/workspace/files/*` operations
  - Ollama-compatible `/api/*` endpoints
  - branch-focused coverage for chat-completion request logic

Run integration tests against `http://localhost:8765`:

```bash
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on top of the [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- Inspired by the need to integrate GitHub Copilot with external tools and workflows
- Thanks to the VS Code and GitHub Copilot teams for their excellent APIs

## Support

- **Issues**: [GitHub Issues](https://github.com/MartyZhou/vscode-copilot-as-service/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MartyZhou/vscode-copilot-as-service/discussions)

---

**Note**: This extension requires an active GitHub Copilot subscription. It is not affiliated with or endorsed by GitHub or Microsoft.
