# ChatGPT Export Tool

A Chrome extension for exporting ChatGPT conversations with rich content preservation, including Markdown and HTML formats.

## Features

- Export current conversation as Markdown or HTML
- Properly extract and preserve images from conversations
- Handle code blocks with syntax highlighting
- Support for LaTeX equations
- Clean, responsive formatting for exported HTML
- Preserve the structure of lists, links, and other formatting

## Coming Soon

- Batch export of all conversations
- Downloading images locally
- Archive format with folder structure
- Search/index capabilities

## Installation

1. Clone this repository or download as ZIP
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer Mode" at the top right
4. Click "Load unpacked" and select the folder containing this extension
5. The extension should now appear in your Chrome toolbar

## Usage

1. Visit [ChatGPT](https://chatgpt.com) or [chat.openai.com](https://chat.openai.com)
2. Have a conversation with ChatGPT
3. Click the extension icon in your Chrome toolbar
4. Select your preferred export format(s)
5. Click "Export Current Conversation"
6. The conversation will be downloaded in your selected format(s)

**Note:** The extension only works when you're actively on a ChatGPT conversation page.

## Development

This extension is built with vanilla JavaScript and uses Chrome extension manifest v3.

Key files:
- `manifest.json` - Extension configuration
- `popup.html` and `popup.js` - Extension popup interface
- `content.js` - Content script that extracts conversation data

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT License