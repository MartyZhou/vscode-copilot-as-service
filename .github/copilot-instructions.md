# GitHub Copilot Instructions

This file provides coding standards and best practices for contributing to the VS Code Copilot as Service extension codebase.

## General Guidelines

- **Zero Lint Errors**: All changes must pass `npm run lint` without errors or warnings
- **TypeScript Best Practices**: Follow strict TypeScript conventions
- **Build Success**: All code must compile successfully with `npm run compile`
- **Professional Code**: No emojis in code, documentation, or user-facing messages

## TypeScript Standards

- Use explicit types for function parameters and return values
- Avoid `any` type unless absolutely necessary
- Use `const` over `let` when variables don't need reassignment
- Follow async/await patterns consistently
- Handle errors gracefully with try-catch blocks

## Code Quality

- Remove unused imports and variables
- No trailing whitespace in files
- Use meaningful variable and function names
- Keep functions focused and concise
- No emojis in code or user messages
- Professional, clear error messages

## Testing Requirements

- Run tests before committing: `npm run test`
- Ensure code compiles without errors

## File Operations

- Use `fs.promises` for async file operations
- Handle file system errors appropriately
- Use `path.join()` for cross-platform path handling
- Clean up resources (file handles, watchers, etc.)

## VS Code Extension Guidelines

- Follow VS Code extension API patterns
- Register and dispose of resources properly
- Use VS Code's workspace and file system APIs
- Handle extension activation/deactivation correctly

## Before Submitting Changes

1. Run `npm run lint` - must pass with zero errors
2. Run `npm run compile` - must compile successfully
3. Review changes for TypeScript best practices
4. Ensure no unused code or imports remain
5. Verify functionality works as expected
6. No emojis or unprofessional content

## Common Patterns in This Codebase

- Use `vscode` namespace for VS Code APIs
- Follow the existing project structure (extension.ts, routes.ts, handlers/)
- Maintain backward compatibility when possible
- Use modular handler pattern for new endpoints
- Follow the existing command registration patterns
- All user-facing messages should be professional and clear

## HTTP API Patterns

- All endpoints should follow OpenAI-compatible patterns where applicable
- ErroBuild succeeds
- [ ] No console.log statements left behind (use proper logging)
- [ ] Error handling implemented
- [ ] Resources properly disposed
- [ ] Documentation updated if needed
- [ ] No emojis in code or messages
- [ ] Professional and clear user communication

- Server should start automatically if `autoStart` is enabled
- Status bar should reflect current server state
- Handle configuration changes gracefully
- Clean up resources on deactivation

## Code Review Checklist

- [ ] No lint errors introduced
- [ ] TypeScript best practices followed
- [ ] Unit tests not broken
- [ ] Build succeeds
- [ ] No console.log statements left behind
- [ ] Error handling implemented
- [ ] Resources properly disposed
- [ ] Documentation updated if needed
