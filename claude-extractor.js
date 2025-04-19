// Improved Claude-specific conversation extraction logic
// This specifically targets elements with data-test-render-count

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
                    
                    // Handle Claude's unique code block structure
                    // Check for code block container with relative group/copy class pattern
                    if (node.className && 
                        (node.className.includes('relative group/copy') || 
                         node.className.includes('relative group'))) {
                        // This is likely a Claude code block container
                        const preElement = node.querySelector('pre');
                        if (preElement) {
                            // Look for code or code-block elements
                            const codeElement = preElement.querySelector('.code-block__code') || 
                                              preElement.querySelector('code');
                            
                            if (codeElement) {
                                // Try to extract language
                                let language = '';
                                
                                // Claude often has a language indicator in a div with text-xs class
                                const langDiv = node.querySelector('div.text-xs, div.text-text-500');
                                if (langDiv && langDiv.textContent) {
                                    language = langDiv.textContent.trim().toLowerCase();
                                }
                                
                                // Also check code element classes for language hints
                                if (!language && codeElement.className) {
                                    const langMatch = codeElement.className.match(/language[-_](\w+)/i);
                                    if (langMatch && langMatch[1]) {
                                        language = langMatch[1].toLowerCase();
                                    }
                                }
                                
                                // Get the text content of the code
                                const codeText = codeElement.textContent || '';
                                console.log("Found code block with language:", language);
                                
                                return `\n\n\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
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
                    
                    // Handle inline code specifically for Claude's style
                    if (node.className && 
                        (node.className.includes('bg-text-200/5') || 
                         node.className.includes('whitespace-pre-wrap'))) {
                        console.log("Found inline code:", node.textContent);
                        return '`' + node.textContent + '`';
                    }
                    
                    // Inline code (default)
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

// Extract Claude conversation using a simpler, more targeted approach
function extractClaudeMessages(debug = false) {
    console.log("Starting Claude conversation export...");
    claudeProcessedImageSrcs.clear();
    
    // Enable verbose mode for debugging
    const verbose = debug || (window.location.href.includes('debug=true'));
    
    if (verbose) {
        console.log("VERBOSE MODE: Claude extractor running with detailed logs");
        console.log("Document title:", document.title);
        console.log("Current URL:", window.location.href);
    }
    
    // Try a more targeted approach to find Claude messages
    // Start with direct queries for elements with data-test-render-count
    let messageBlocks = Array.from(document.querySelectorAll('div[data-test-render-count]'));
    
    // If this fails, look for specific Claude selectors
    if (messageBlocks.length < 2) {
        console.log("Could not find enough messages using data-test-render-count, trying other Claude selectors");
        
        // Try Claude's current UI elements
        const claudeSelectors = [
            '.font-claude-message', 
            'div[data-is-streaming="false"].group',
            'div.grid-cols-1.grid.gap-2\\.5',
            '.whitespace-pre-wrap.break-words'
        ];
        
        for (const selector of claudeSelectors) {
            try {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length >= 2) {
                    console.log(`Found ${elements.length} Claude messages using selector: ${selector}`);
                    messageBlocks = elements;
                    break;
                }
            } catch (e) {
                console.log(`Error with selector ${selector}:`, e.message);
            }
        }
    }
    
    // If we still can't find messages, try a broader approach
    if (messageBlocks.length < 2) {
        console.log("Could not find enough message blocks with targeted selectors, trying broader approach");
        
        // Try to find elements with substantial paragraph content
        const paragraphs = Array.from(document.querySelectorAll('p.whitespace-pre-wrap, div > p.whitespace-pre-wrap'));
        
        // Group paragraphs by parent to find message containers
        const parentMap = new Map();
        
        paragraphs.forEach(p => {
            // Look for parent with reasonable depth
            let parent = p.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
                // Check if this seems like a message container
                if (parent.querySelector('ol') || 
                    parent.querySelector('ul') || 
                    parent.children.length > 1) {
                    
                    if (!parentMap.has(parent)) {
                        parentMap.set(parent, []);
                    }
                    parentMap.get(parent).push(p);
                    break;
                }
                
                parent = parent.parentElement;
                depth++;
            }
        });
        
        // Find parents with the most paragraphs (likely message containers)
        const messageContainers = Array.from(parentMap.entries())
            .filter(([parent, paragraphs]) => paragraphs.length > 0)
            .sort(([parent1, p1], [parent2, p2]) => p2.length - p1.length)
            .map(([parent]) => parent);
        
        if (messageContainers.length >= 2) {
            console.log(`Found ${messageContainers.length} potential message containers by paragraph grouping`);
            messageBlocks = messageContainers;
        }
    }
    
    if (messageBlocks.length < 2) {
        console.error("Failed to find enough Claude messages for extraction");
        if (verbose) {
            console.log("DOM structure sample:", document.body.innerHTML.substring(0, 1000));
        }
        return null;
    }
    
    console.log(`Found ${messageBlocks.length} Claude message blocks`);
    
    // Process each message block to extract content
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
    
    // Extract from content if needed
    if (claudeVersion === 'Claude') {
        const versionPatterns = [
            /Claude\s*([\d\.]+|Opus|Sonnet|Haiku)/i,
            /I am Claude\s*([\d\.]+|Opus|Sonnet|Haiku)/i
        ];
        
        const allText = document.body.textContent;
        for (const pattern of versionPatterns) {
            const match = allText.match(pattern);
            if (match && match[1]) {
                claudeVersion = 'Claude ' + match[1];
                break;
            }
        }
    }
    
    // Simplify message role detection for Claude
    messageBlocks.forEach((block, index) => {
        let isUser = false;
        
        // 1. For clear cases with class indicators
        if (block.classList && block.classList.contains('font-claude-message')) {
            isUser = false;
        } 
        else if (block.closest && block.closest('[data-message-author-role="assistant"]')) {
            isUser = false;
        }
        else if (block.closest && block.closest('[data-message-author-role="user"]')) {
            isUser = true;
        }
        // 2. Content-based detection
        else if (block.textContent && (
            block.textContent.includes('I am Claude') || 
            block.textContent.includes('As an AI assistant') ||
            block.textContent.match(/Claude (3\.5|Opus|Sonnet|Haiku)/i))) {
            isUser = false;
        }
        // 3. Position-based detection
        else {
            // In Claude, even indices (0, 2, 4...) are typically user messages
            isUser = (index % 2 === 0);
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
    extractMessages: function(debug = false) {
        const result = extractClaudeMessages(debug);
        
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