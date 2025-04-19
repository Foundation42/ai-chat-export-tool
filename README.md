# AI Chat Export Tool

A browser extension for exporting AI chat conversations with rich content preservation, including Markdown and HTML formats. Currently supports ChatGPT with experimental support for Claude and planned support for Gemini.

## Features

- Export current conversation as Markdown or HTML
- Properly extract and preserve images from conversations
- Handle code blocks with syntax highlighting
- Support for LaTeX equations with proper rendering in HTML export
- Clean, responsive formatting with automatic dark mode support
- Preserve the structure of lists, links, and other formatting
- Compatible with both classic ChatGPT interface and newer versions

## Installation

### Chrome / Edge / Brave (and other Chromium browsers)

1. Clone this repository or download as ZIP
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer Mode" at the top right
4. Click "Load unpacked" and select the folder containing this extension
5. The extension should now appear in your browser toolbar

### Firefox (Coming Soon)

Firefox support is planned for a future release.

## Usage

1. Visit one of the supported AI chat platforms:
   - [ChatGPT](https://chatgpt.com) or [chat.openai.com](https://chat.openai.com)
   - [Claude](https://claude.ai) (experimental support)
2. Have a conversation with the AI assistant
3. Click the extension icon in your browser toolbar
4. Select your preferred export format(s):
   - **Markdown**: Clean text format with images preserved as links
   - **HTML**: Rich formatted page with syntax highlighting and LaTeX rendering
5. Click "Export Current Conversation"
6. The conversation will be downloaded in your selected format(s)

**Note:** The extension only works when you're actively on a supported AI conversation page.

**Claude Support:** Claude support is experimental and may not work perfectly with all conversations or UI versions.

## Features in Detail

### Markdown Export
- Preserves all conversation structure
- Properly formats code blocks with language detection
- Includes references to all images
- Handles special elements like LaTeX equations
- Compatible with most Markdown processors

### HTML Export
- Responsive design that works on all devices
- Code syntax highlighting for 10+ programming languages
- Mathematical equations rendered with MathJax
- Automatic dark mode support based on system preferences
- Image rendering with proper alt text

## Supported Platforms

- ChatGPT (OpenAI) - Fully supported
- Claude (Anthropic) - Experimental support
- Gemini (Google) - Coming soon

## Coming Soon
- Batch export of all conversations
- Downloading images locally with the conversation
- Archive format with organized folder structure
- Search/index capabilities for exported conversations

## Development

This extension is built with vanilla JavaScript and uses browser extension manifest v3.

Key files:
- `manifest.json` - Extension configuration
- `popup.html` and `popup.js` - Extension popup interface
- `content.js` - Content script that extracts conversation data
- `background.js` - Background service worker for handling downloads

### Building and Testing

1. Make your changes to the source files
2. Test the extension by loading it unpacked in your browser
3. To test functionality, navigate to ChatGPT and try exporting conversations

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests for:

- Bug fixes
- New features
- UI improvements
- Documentation updates
- Compatibility with ChatGPT UI changes

## License

MIT License