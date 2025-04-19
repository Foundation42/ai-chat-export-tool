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

// Extract Claude conversation using improved approach with better debug
function extractClaudeMessages(debug = false) {
    console.log("Starting Claude conversation export...");
    claudeProcessedImageSrcs.clear();
    
    // Enable verbose mode for debugging
    const verbose = debug || (window.location.href.includes('debug=true'));
    
    if (verbose) {
        console.log("VERBOSE MODE: Claude extractor running with detailed logs");
    }
    
    // Try to detect which version of the Claude UI we're using
    let claudeUiVersion = 'unknown';
    
    // Check for identifying DOM elements to determine UI version
    if (document.querySelector('.font-claude-message')) {
        claudeUiVersion = 'classic';
    } else if (document.querySelector('[data-message-author-role]')) {
        claudeUiVersion = 'modern';
    } else if (document.querySelector('.group\\/conversation-turn')) {
        claudeUiVersion = 'new-chat';
    }
    
    console.log(`Detected Claude UI version: ${claudeUiVersion}`);
    
    // Find the main conversation container with multiple fallback options
    const containerSelectors = [
        'div[role="region"]',
        '.flex.min-h-screen',
        'main',
        '.chat-container',
        '#__next main',
        '.chat-view',
        'div[class*="chat-view"]',
        'div[class*="conversation"]',
        '.mx-auto.flex.max-w-\\[--thread-content-max-width\\]', // New Claude UI
        '.flex.h-full.flex-col', // Another common container
        'div.overflow-y-auto', // Scrollable container
        'body', // Last resort - search the entire document
    ];
    
    let mainContainer = null;
    for (const selector of containerSelectors) {
        try {
            const element = document.querySelector(selector);
            if (element) {
                mainContainer = element;
                console.log(`Found Claude container using selector: ${selector}`);
                break;
            }
        } catch (e) {
            if (verbose) {
                console.log(`Error with selector ${selector}: ${e.message}`);
            }
        }
    }
    
    if (!mainContainer) {
        console.error('Could not find the Claude conversation container.');
        return null;
    }
    
    if (verbose) {
        console.log("Main container HTML sample:", mainContainer.innerHTML.substring(0, 500) + "...");
        console.log("Main container children count:", mainContainer.children.length);
    }
    
    // Try multiple approaches to find all message blocks in Claude's interface
    let messageBlocks = [];
    
    // IMPORTANT: Search WITHIN the main container, not the entire document
    
    // Approach 1: Look for elements with data attributes specific to Claude
    const dataElements = Array.from(mainContainer.querySelectorAll('[data-message-author-role], [data-test-render-count]'));
    if (dataElements.length > 0) {
        console.log(`Found ${dataElements.length} messages using data attributes`);
        messageBlocks = dataElements;
    }
    
    // Approach 2: Try Claude's current common message containers
    if (messageBlocks.length === 0) {
        const currentSelectors = [
            'div.min-h-8.text-message', // Current Claude messages
            'article.text-token-text-primary',  // Another common pattern
            'div.whitespace-pre-wrap.break-words', // Content within messages
            'div.markdown.prose', // Markdown content
            '.font-claude-message'
        ];
        
        for (const selector of currentSelectors) {
            try {
                const elements = Array.from(mainContainer.querySelectorAll(selector));
                if (elements.length > 1) {
                    console.log(`Found ${elements.length} messages using ${selector}`);
                    messageBlocks = elements;
                    break;
                }
            } catch (e) {
                if (verbose) {
                    console.log(`Error with selector ${selector}: ${e.message}`);
                }
            }
        }
    }
    
    // Approach 3: Try to find specific Claude UI structures (updated April 2025)
    if (messageBlocks.length === 0) {
        // Look for specific patterns in the current Claude UI
        const patterns = [
            '.flex.flex-col.gap-1.empty\\:hidden', // Message content container
            '.text-base.my-auto', // Common wrapper
            '.mx-auto.flex.max-w-\\[--thread-content-max-width\\]', // Thread container
            'div.group\\/conversation-turn', // Conversation turn
            '.whitespace-pre-wrap', // Pre-wrapped text
            'div[data-is-streaming] > div', // Streaming content
            'div.flex.max-w-full.flex-col', // Message container
            'div.prose', // Prose content
            'div.markdown', // Markdown content
            'div.min-h-full > div > p' // Paragraphs in message containers
        ];
        
        for (const pattern of patterns) {
            try {
                const elements = Array.from(mainContainer.querySelectorAll(pattern));
                if (elements.length > 1) {
                    console.log(`Found ${elements.length} messages using pattern ${pattern}`);
                    messageBlocks = elements;
                    break;
                }
            } catch (e) {
                // Some complex selectors might fail, continue to next one
                if (verbose) {
                    console.log(`Selector error for ${pattern}: ${e.message}`);
                }
            }
        }
    }
    
    // Approach 4: Look for grid-cols-1 which might contain message blocks
    if (messageBlocks.length === 0) {
        try {
            const gridElements = Array.from(mainContainer.querySelectorAll('.grid-cols-1'));
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
        } catch (e) {
            if (verbose) {
                console.log(`Error in grid elements search: ${e.message}`);
            }
        }
    }
    
    // Approach 5: Try general message patterns
    if (messageBlocks.length === 0) {
        // Common Claude UI patterns for messages
        const messagePatterns = [
            'div[class*="message"]',
            'div[class*="chat-message"]',
            'div[class*="chat-turn"]',
            'div[class*="message-content"]',
            'div[class*="bubble"]',
            'div[class*="message-bubble"]',
            'div > div > p'
        ];
        
        // Try each pattern
        for (const pattern of messagePatterns) {
            try {
                const elements = Array.from(mainContainer.querySelectorAll(pattern));
                if (elements.length > 1) { // Need at least 2 messages for a conversation
                    console.log(`Found ${elements.length} messages using ${pattern}`);
                    messageBlocks = elements;
                    break;
                }
            } catch (e) {
                if (verbose) {
                    console.log(`Error with selector ${pattern}: ${e.message}`);
                }
            }
        }
    }
    
    // Last resort: look for paragraphs with substantial text
    if (messageBlocks.length === 0) {
        // Find any paragraph or div with substantial text directly inside main container
        const textElements = Array.from(mainContainer.querySelectorAll('p, div > p, div.whitespace-pre-wrap'));
        
        // Filter to elements with meaningful content
        const contentElements = textElements.filter(el => {
            return el.textContent && el.textContent.trim().length > 15 && 
                   !el.closest('header') && !el.closest('footer') &&
                   !el.closest('nav');
        });
        
        if (contentElements.length > 1) {
            console.log(`Found ${contentElements.length} text elements with content`);
            messageBlocks = contentElements;
        }
    }
    
    // Last resort: Manual DOM walk to find message-like structures
    if (messageBlocks.length === 0) {
        console.log("Attempting manual DOM walk as last resort");
        const allDivs = mainContainer.querySelectorAll('div');
        const candidates = [];
        
        Array.from(allDivs).forEach(div => {
            // Look for divs with meaningful text, paragraphs, and not too many children
            const text = div.textContent?.trim() || '';
            const hasParagraphs = div.querySelectorAll('p').length > 0;
            const childCount = div.children.length;
            
            if ((text.length > 20 || hasParagraphs) && childCount < 15 && childCount > 0) {
                candidates.push(div);
            }
        });
        
        // Sort by text length, assuming longer text is more likely to be messages
        candidates.sort((a, b) => b.textContent.length - a.textContent.length);
        
        if (candidates.length > 1) {
            console.log(`Found ${candidates.length} potential message divs via manual DOM walk`);
            messageBlocks = candidates.slice(0, 20); // Take top 20 candidates
        }
    }
    
    // If still no messages found, log detailed debug info
    if (messageBlocks.length === 0) {
        console.error('Claude message detection failed. Detailed DOM structure:');
        
        // Log first few divs in the container to understand structure
        const divs = mainContainer.querySelectorAll('div');
        console.log(`Container has ${divs.length} divs.`);
        
        if (verbose) {
            Array.from(divs).slice(0, 5).forEach((div, i) => {
                console.log(`Div ${i} classes:`, div.className);
                console.log(`Div ${i} children:`, div.children.length);
                console.log(`Div ${i} text sample:`, div.textContent.substring(0, 100) + "...");
            });
        }
        
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
    // Only expose the necessary extraction function and metadata
    extractMessages: function() {
        const result = extractClaudeMessages();
        
        // If extraction failed, return null
        if (!result) return null;
        
        // Return data in a standardized format compatible with content.js
        return {
            messages: result.messages,
            stats: result.stats,
            // Add Claude-specific metadata
            metadata: {
                platform: 'claude',
                claudeVersion: result.claudeVersion,
                // Role names for display
                userLabel: 'Human',
                assistantLabel: result.claudeVersion || 'Claude'
            }
        };
    }
};