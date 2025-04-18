# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Test Commands
- No formal build system detected
- Run JavaScript files with: `node filename.js`
- To test functionality: Test in a browser environment with ChatGPT open

## Code Style Guidelines
- JavaScript: Use modern ES6+ syntax
- Indentation: 4 spaces
- Variable declarations: Use `const` for constants, `let` for variables
- Error handling: Use try/catch blocks for error handling with console.error logs
- Naming: camelCase for variables and functions, descriptive names
- Image handling: Verify image sources carefully to avoid UI elements
- Comments: Add descriptive comments for complex logic
- DOM traversal: Use querySelector/querySelectorAll with robust selectors
- Functions: Use named functions, split complex logic into helper functions
- String literals: Use template literals for complex strings
- Console output: Include informative logging for debugging

## Feature Focus
- Browser extension for ChatGPT conversation export
- Markdown generation from conversations
- Image extraction and handling
- HTML export capability