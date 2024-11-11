# Acai Language Server

A Language Server Protocol (LSP) implementation that enables AI-assisted code generation and modification through embedded instructions in code comments.

## Features

- Embedded instruction parsing for AI model configuration
- Support for model selection and temperature control
- Custom prompts through code comments
- Integration with Claude AI models
- VS Code Language Server Protocol support

## Installation

```bash
npm install @travisennis/acai-language-server
```

## Usage

Embed AI instructions in your code using special comment syntax:

```typescript
// model: claude-3-5-sonnet-20241022
// temperature: 0.3
// prompt: Optimize this function for performance

function someFunction() {
  // Your code here
}
```

Or use the short form for quick prompts:

```typescript
//% Optimize this function for performance
function someFunction() {
  // Your code here
}
```

## Configuration

The language server supports the following instruction types:
- `// model:` - Specify the AI model to use
- `// temperature:` - Set the temperature for generation (0.0 - 1.0)
- `// prompt:` - Provide detailed instructions
- `//%` - Short form for quick prompts

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

## License

MIT
