// Claude-specific conversation extraction logic
// This file contains specialized functions for extracting Claude AI conversations

// Set to track images we've already processed to avoid duplicates
let claudeProcessedImageSrcs = new Set();

// Helper function to extract image details from Claude
function extractClaudeImageMarkdown(imgElement) {
    if (!imgElement) return '';
    
    const src = imgElement.getAttribute('src');
    if (!src || claudeProcessedImageSrcs.has(src)) {
        return ''; // Skip if already processed
    }
    
    // Filter out UI elements and icons
    if (src.startsWith('data:') || 
        (src.includes('http') && 
         !src.includes('api.anthropic.com') && 
         !src.includes('anthropic.com') && 
         !src.includes('/blob:'))) {
            
        console.log(`Skipping UI image: ${src.substring(0, 30)}...`);
        return '';
    }
    
    // Mark this image as processed
    claudeProcessedImageSrcs.add(src);
    
    const alt = imgElement.getAttribute('alt') || 'Image';
    
    // Extract image ID from URL if possible
    let imageId = 'unknown';
    try {
        if (src && src.includes('/')) {
            // Try to find a UUID in the URL
            const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
            const match = src.match(uuidPattern);
            if (match && match[1]) {
                imageId = match[1];
            } else {
                // Use the last part of the URL
                const urlParts = src.split('/');
                if (urlParts.length > 0) {
                    imageId = urlParts[urlParts.length - 1].split('?')[0];
                }
            }
        }
    } catch (e) {
        console.error('Error extracting image ID:', e);
    }
    
    console.log(`Processing Claude image: ${src.substring(0, 50)}... (ID: ${imageId})`);
    return `\n\n![${alt} (ID: ${imageId})](${src}) <!-- Image URI: ${src} | Image ID: ${imageId} -->\n\n`;
}

// Process node and its children recursively for Claude
function processClaudeNode(node) {
    if (!node) return '';
    
    // Skip script and style nodes
    if (node.nodeType === Node.ELEMENT_NODE && 
        (node.tagName === 'SCRIPT' || node.tagName === 'STYLE')) {
        return '';
    }
    
    switch (node.nodeType) {
        case Node.TEXT_NODE:
            return node.textContent;
            
        case Node.ELEMENT_NODE:
            // Handle different element types
            switch (node.tagName) {
                case 'IMG':
                    return extractClaudeImageMarkdown(node);
                    
                case 'BR':
                    return '\n';
                    
                case 'P':
                    let pContent = Array.from(node.childNodes).map(processClaudeNode).join('');
                    return pContent + '\n\n';
                    
                case 'DIV':
                    // Special Claude artifact handling
                    if (node.getAttribute('data-artifact-id')) {
                        // This is an artifact panel - try to extract content based on type
                        const artifactType = node.getAttribute('data-artifact-type');
                        if (artifactType === 'image/svg+xml') {
                            const svgElement = node.querySelector('svg');
                            if (svgElement) {
                                return `\n\n\`\`\`svg\n${svgElement.outerHTML}\n\`\`\`\n\n`;
                            }
                        } else if (artifactType === 'text/markdown') {
                            const content = node.querySelector('.artifact-content');
                            if (content) {
                                return `\n\n${processClaudeNode(content)}\n\n`;
                            }
                        } else if (artifactType === 'application/vnd.ant.code') {
                            const codeContent = node.querySelector('pre code');
                            if (codeContent) {
                                const language = codeContent.className.replace('language-', '');
                                return `\n\n\`\`\`${language}\n${codeContent.textContent}\n\`\`\`\n\n`;
                            }
                        }
                    }
                    
                    // Process all children
                    return Array.from(node.childNodes).map(processClaudeNode).join('');
                    
                case 'STRONG':
                case 'B':
                    return '**' + Array.from(node.childNodes).map(processClaudeNode).join('') + '**';
                    
                case 'EM':
                case 'I':
                    return '*' + Array.from(node.childNodes).map(processClaudeNode).join('') + '*';
                    
                case 'CODE':
                    // Check if this is inside a PRE (code block)
                    const parentTag = node.parentNode?.nodeName || '';
                    if (parentTag === 'PRE') {
                        // This will be handled by the PRE processor
                        return node.textContent;
                    }
                    // Inline code
                    return '`' + node.textContent + '`';
                    
                case 'PRE':
                    // Code block
                    const codeNode = node.querySelector('code');
                    const language = codeNode ? (codeNode.className.replace('language-', '') || '') : '';
                    const code = codeNode ? codeNode.textContent : node.textContent;
                    return '```' + language + '\n' + code + '\n```\n\n';
                    
                case 'A':
                    const href = node.getAttribute('href');
                    const text = Array.from(node.childNodes).map(processClaudeNode).join('');
                    return '[' + text + '](' + href + ')';
                    
                case 'UL':
                    return '\n' + Array.from(node.querySelectorAll('li')).map(li => 
                        '- ' + Array.from(li.childNodes).map(processClaudeNode).join('')
                    ).join('\n') + '\n\n';
                    
                case 'OL':
                    return '\n' + Array.from(node.querySelectorAll('li')).map((li, index) => 
                        (index + 1) + '. ' + Array.from(li.childNodes).map(processClaudeNode).join('')
                    ).join('\n') + '\n\n';
                    
                case 'LI':
                    // These are handled by UL and OL processing
                    if (node.parentNode && 
                       (node.parentNode.nodeName === 'UL' || node.parentNode.nodeName === 'OL')) {
                        return '';
                    }
                    return Array.from(node.childNodes).map(processClaudeNode).join('');
                    
                case 'H1':
                    return '# ' + Array.from(node.childNodes).map(processClaudeNode).join('') + '\n\n';
                case 'H2':
                    return '## ' + Array.from(node.childNodes).map(processClaudeNode).join('') + '\n\n';
                case 'H3':
                    return '### ' + Array.from(node.childNodes).map(processClaudeNode).join('') + '\n\n';
                case 'H4':
                    return '#### ' + Array.from(node.childNodes).map(processClaudeNode).join('') + '\n\n';
                case 'H5':
                    return '##### ' + Array.from(node.childNodes).map(processClaudeNode).join('') + '\n\n';
                case 'H6':
                    return '###### ' + Array.from(node.childNodes).map(processClaudeNode).join('') + '\n\n';
                    
                default:
                    // For other elements, just process children
                    return Array.from(node.childNodes).map(processClaudeNode).join('');
            }
        
        default:
            return '';
    }
}

// Extract Claude conversation using the proven working approach
function extractClaudeMessages() {
    console.log("Starting Claude conversation export...");
    claudeProcessedImageSrcs.clear();
    
    // Find the main conversation container
    const mainContainer = document.querySelector('div[role="region"]') || 
                         document.querySelector('.flex.min-h-screen');
    
    if (!mainContainer) {
        console.error('Could not find the Claude conversation container.');
        return null;
    }
    
    // Try multiple approaches to find all message blocks in Claude's interface
    let messageBlocks = [];
    
    // Approach 1: Look for data-test-render-count elements (from your example)
    const countElements = Array.from(mainContainer.querySelectorAll('[data-test-render-count]'));
    if (countElements.length > 0) {
        console.log(`Found ${countElements.length} messages using data-test-render-count`);
        messageBlocks = countElements;
    }
    
    // Approach 2: Look for whitespace-pre-wrap elements that contain message content
    if (messageBlocks.length === 0) {
        const contentElements = Array.from(mainContainer.querySelectorAll('.whitespace-pre-wrap.break-words'));
        if (contentElements.length > 0) {
            console.log(`Found ${contentElements.length} messages using .whitespace-pre-wrap.break-words`);
            messageBlocks = contentElements;
        }
    }
    
    // Approach 3: Look for grid-cols-1 which might contain message blocks
    if (messageBlocks.length === 0) {
        const gridElements = Array.from(document.querySelectorAll('.grid-cols-1'));
        if (gridElements.length > 0) {
            // Filter to only the elements that seem to be messages
            const messageGrids = gridElements.filter(el => {
                return el.textContent.trim().length > 0 && !el.querySelector('script');
            });
            
            if (messageGrids.length > 0) {
                console.log(`Found ${messageGrids.length} messages using .grid-cols-1`);
                messageBlocks = messageGrids;
            }
        }
    }
    
    // Approach 4: Try to find elements with text content
    if (messageBlocks.length === 0) {
        // Common Claude UI patterns for messages
        const messagePatterns = [
            '.font-claude-message',
            '.whitespace-normal.break-words',
            'p.whitespace-pre-wrap',
            'div.min-h-full > div > p',
            '[style*="whitespace"][style*="pre-wrap"]',
            'div[data-is-streaming] > div',
            'div > .text-xl'
        ];
        
        // Try each pattern
        for (const pattern of messagePatterns) {
            const elements = Array.from(document.querySelectorAll(pattern));
            if (elements.length > 1) { // Need at least 2 messages for a conversation
                console.log(`Found ${elements.length} messages using ${pattern}`);
                messageBlocks = elements;
                break;
            }
        }
    }
    
    // Approach 5: Look for div elements with specific depths and text content
    if (messageBlocks.length === 0) {
        // Find all divs with text content
        const allDivs = Array.from(document.querySelectorAll('div'));
        const textDivs = allDivs.filter(div => {
            // Check if div has direct text content and reasonable length
            const hasText = Array.from(div.childNodes).some(node => 
                node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 20
            );
            
            // Or contains paragraphs
            const hasParagraphs = div.querySelectorAll('p').length > 0;
            
            return (hasText || hasParagraphs) && !div.querySelector('script');
        });
        
        if (textDivs.length > 1) {
            console.log(`Found ${textDivs.length} potential message divs with text content`);
            messageBlocks = textDivs;
        }
    }
    
    if (messageBlocks.length === 0) {
        console.error('Could not find any Claude messages. The page structure might have changed.');
        return null;
    }
    
    console.log(`Found ${messageBlocks.length} Claude message blocks`);
    
    // Process each message block to determine if it's from user or assistant
    const messages = [];
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    
    // Get Claude version info if available
    const claudeVersionElement = document.querySelector('[data-theme="claude"]');
    let claudeVersion = claudeVersionElement ? claudeVersionElement.getAttribute('data-theme') : 'Claude';
    
    // Try to detect more specific Claude version
    const pageTitle = document.title || '';
    if (pageTitle.includes('Claude')) {
        const versionMatch = pageTitle.match(/Claude\s*([\d\.]+|Opus|Sonnet|Haiku)/i);
        if (versionMatch && versionMatch[1]) {
            claudeVersion = 'Claude ' + versionMatch[1];
        }
    }
    
    // Fallback to extracted version from page content
    if (claudeVersion === 'Claude') {
        const versionPatterns = [
            /Claude\s*([\d\.]+|Opus|Sonnet|Haiku)/i,
            /I am Claude\s*([\d\.]+|Opus|Sonnet|Haiku)/i
        ];
        
        for (const block of messageBlocks) {
            for (const pattern of versionPatterns) {
                const match = block.textContent.match(pattern);
                if (match && match[1]) {
                    claudeVersion = 'Claude ' + match[1];
                    break;
                }
            }
            if (claudeVersion !== 'Claude') break;
        }
    }
    
    messageBlocks.forEach((block, index) => {
        // Try to determine if this is a user or assistant message
        // In Claude, user messages often have different style/class than assistant messages
        
        let isUser = false;
        
        // Try multiple methods to determine if this is a user or Claude message
        
        // Method 1: Check for claude-specific classes or attribute patterns
        if (block.classList.contains('font-claude-message') ||
            block.closest('[data-is-streaming="true"]') ||
            block.querySelector('.text-token-text-primary') ||
            block.closest('[data-message-author-role="assistant"]')) {
            isUser = false;
        } 
        // Look for user-specific patterns
        else if (block.classList.contains('bg-token-message-surface') ||
                block.closest('[data-message-author-role="user"]')) {
            isUser = true;
        }
        // Method 2: Check content patterns that might indicate Claude
        else if (block.textContent.includes('I am Claude') || 
                block.textContent.includes('As an AI assistant') ||
                block.textContent.match(/Claude (3\.5|Opus|Sonnet|Haiku)/i)) {
            isUser = false;
        }
        // Method 3: Position in conversation
        else if (index === 0) {
            isUser = true; // First message is typically from user
        } 
        // Method 4: Alternating pattern (fallback)
        else {
            isUser = index % 2 === 0; // Even indices are user messages, odd are Claude
        }
        
        // Process the content
        const content = processClaudeNode(block).trim();
        
        if (content) {
            messages.push({
                role: isUser ? 'user' : 'assistant',
                content: content,
                index: index
            });
            
            if (isUser) {
                userMessageCount++;
            } else {
                assistantMessageCount++;
            }
        }
    });
    
    console.log(`Extracted ${messages.length} Claude messages: ${userMessageCount} user, ${assistantMessageCount} assistant`);
    console.log(`Found ${claudeProcessedImageSrcs.size} unique Claude images`);
    
    return {
        messages: messages,
        claudeVersion: claudeVersion,
        stats: {
            userCount: userMessageCount,
            assistantCount: assistantMessageCount,
            imageCount: claudeProcessedImageSrcs.size
        }
    };
}

// Export the functions for use in content.js
window.ClaudeExtractor = {
    extractMessages: extractClaudeMessages,
    processNode: processClaudeNode,
    
    // Generate standalone Claude exports (for direct use without extension integration)
    generateMarkdown: function(result) {
        const { messages, claudeVersion, stats } = result;
        
        let markdown = `# ${claudeVersion} Conversation Export\n\n`;
        markdown += `Exported on: ${new Date().toLocaleString()}\n\n`;
        
        messages.forEach(message => {
            const roleTitle = message.role === 'user' ? 'Human' : claudeVersion;
            markdown += `## ${roleTitle}\n\n${message.content}\n\n`;
        });
        
        // Add a note if the distribution seems off
        if (stats.userCount === 0 || stats.assistantCount === 0) {
            console.warn("Warning: Only detected messages from one participant. The extraction might be incomplete.");
            markdown += "\n\n*Note: The export might be incomplete. Only detected messages from " + 
                      (stats.userCount > 0 ? "Human" : claudeVersion) + ".*\n";
        }
        
        return markdown;
    },
    
    generateHTML: function(result) {
        const { messages, claudeVersion, stats } = result;
        
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${claudeVersion} Conversation Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .message {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 10px;
        }
        .human {
            background-color: #f1f3f5;
        }
        .claude {
            background-color: #f8f9fa;
            border-left: 4px solid #7b68ee;
        }
        .message-header {
            font-weight: bold;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        pre {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
        }
        code {
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
        }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 5px;
            margin: 10px 0;
        }
        .meta {
            font-size: 0.8em;
            color: #666;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <h1>${claudeVersion} Conversation Export</h1>
    <div class="meta">Exported on: ${new Date().toLocaleString()}</div>
    <div class="conversation">`;
        
        messages.forEach(message => {
            const roleClass = message.role === 'user' ? 'human' : 'claude';
            const roleTitle = message.role === 'user' ? 'Human' : claudeVersion;
            
            html += `
        <div class="message ${roleClass}">
            <div class="message-header">${roleTitle}</div>
            <div class="message-content">
                ${message.content.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')}
            </div>
        </div>`;
        });
        
        // Add warning for incomplete export if needed
        if (stats.userCount === 0 || stats.assistantCount === 0) {
            html += `
        <div class="warning">
            <p><em>Note: The export might be incomplete. Only detected messages from 
            ${stats.userCount > 0 ? "Human" : claudeVersion}.</em></p>
        </div>`;
        }
        
        html += `
    </div>
    <div class="footer">
        <p>Exported with AI Chat Export Tool by Social Magnetics • ${new Date().toISOString().split('T')[0]}</p>
    </div>
</body>
</html>`;
        
        return html;
    }
};