// Improved ChatGPT Conversation Export Script
(function() {
    // Set to track images we've already processed to avoid duplicates
    const processedImageSrcs = new Set();
    
    // Helper function to extract image details
    function extractImageMarkdown(imgElement) {
        if (!imgElement) return '';
        
        const src = imgElement.getAttribute('src');
        if (!src || processedImageSrcs.has(src)) {
            return ''; // Skip if already processed
        }
        
        // Only process images from valid domains (oaiusercontent.com or other trusted sources)
        // This helps filter out icon images and UI elements
        if (src.startsWith('data:') || 
            (src.includes('http') && 
             !src.includes('oaiusercontent.com') && 
             !src.includes('openai.com') && 
             !src.includes('/blob:'))) {
                
            console.log(`Skipping UI image: ${src.substring(0, 30)}...`);
            return '';
        }
        
        // Mark this image as processed
        processedImageSrcs.add(src);
        
        const alt = imgElement.getAttribute('alt') || 'Generated image';
        
        // Extract image ID from URL if possible
        let imageId = 'unknown';
        try {
            if (src && src.includes('/')) {
                // Try to find a UUID in the URL (most reliable method)
                const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
                const match = src.match(uuidPattern);
                if (match && match[1]) {
                    imageId = match[1];
                } else {
                    // Try to extract from the files path segment
                    const filePattern = /files\/([^/?]+)/i;
                    const fileMatch = src.match(filePattern);
                    if (fileMatch && fileMatch[1]) {
                        imageId = fileMatch[1];
                    } else {
                        // Use the last part of the URL as a fallback
                        const urlParts = src.split('/');
                        if (urlParts.length > 0) {
                            imageId = urlParts[urlParts.length - 1].split('?')[0];
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error extracting image ID:', e);
        }
        
        console.log(`Processing image: ${src.substring(0, 50)}... (ID: ${imageId})`);
        return `\n\n![${alt} (ID: ${imageId})](${src}) <!-- Image URI: ${src} | Image ID: ${imageId} -->\n\n`;
    }
    
    // Process node and its children recursively
    function processNode(node) {
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
                // Check for image containers first
                // Enhanced checks for GPT-4o image containers
                const isImageContainer = 
                    (node.classList && (
                        node.classList.contains('group/imagegen-image') || 
                        node.classList.contains('overflow-hidden')
                    )) ||
                    (node.querySelector && (
                        node.querySelector('.group\\/imagegen-image') || 
                        node.querySelector('[style*="aspect-ratio"]')
                    )) ||
                    (node.style && node.style.aspectRatio) || 
                    (node.tagName === 'DIV' && node.className && 
                     (node.className.includes('grid') && node.className.includes('pb-2')));
                
                if (isImageContainer) {
                    const imgElements = node.querySelectorAll('img');
                    if (imgElements && imgElements.length > 0) {
                        console.log(`Found ${imgElements.length} images in container`);
                        
                        // Find the best quality image (not blurred)
                        let bestImage = null;
                        
                        // First, try to find an image in a non-blurred container
                        for (const img of imgElements) {
                            const parentElement = img.parentNode;
                            const style = parentElement && parentElement.style;
                            const className = parentElement && parentElement.className;
                            
                            const hasBlur = style && style.filter && style.filter.includes('blur') ||
                                          className && 
                                          (typeof className === 'string' && className.includes('blur'));
                            
                            // Criteria for good images: no blur + high z-index or opacity=1
                            const hasGoodZ = parentElement && 
                                          parentElement.classList && 
                                          (parentElement.classList.contains('z-1') || 
                                           parentElement.classList.contains('z-2'));
                            
                            const hasGoodOpacity = style && 
                                                style.opacity && 
                                                parseFloat(style.opacity) > 0.8;
                            
                            if (!hasBlur && (hasGoodZ || hasGoodOpacity)) {
                                bestImage = img;
                                break;
                            }
                        }
                        
                        // If we didn't find a good image, take the first one
                        if (!bestImage) bestImage = imgElements[0];
                        
                        return extractImageMarkdown(bestImage);
                    }
                }
                
                // Handle different element types
                switch (node.tagName) {
                    case 'IMG':
                        return extractImageMarkdown(node);
                        
                    case 'BR':
                        return '\n';
                        
                    case 'P':
                        let pContent = Array.from(node.childNodes).map(processNode).join('');
                        return pContent + '\n\n';
                        
                    case 'DIV':
                        // Special case for image containers with style containing aspect-ratio
                        if (node.style && node.style.aspectRatio) {
                            const imgElements = node.querySelectorAll('img');
                            if (imgElements && imgElements.length > 0) {
                                return extractImageMarkdown(imgElements[0]);
                            }
                        }
                        // Process all children
                        return Array.from(node.childNodes).map(processNode).join('');
                        
                    case 'STRONG':
                    case 'B':
                        return '**' + Array.from(node.childNodes).map(processNode).join('') + '**';
                        
                    case 'EM':
                    case 'I':
                        return '*' + Array.from(node.childNodes).map(processNode).join('') + '*';
                        
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
                        const text = Array.from(node.childNodes).map(processNode).join('');
                        return '[' + text + '](' + href + ')';
                        
                    case 'UL':
                        return '\n' + Array.from(node.querySelectorAll('li')).map(li => 
                            '- ' + Array.from(li.childNodes).map(processNode).join('')
                        ).join('\n') + '\n\n';
                        
                    case 'OL':
                        return '\n' + Array.from(node.querySelectorAll('li')).map((li, index) => 
                            (index + 1) + '. ' + Array.from(li.childNodes).map(processNode).join('')
                        ).join('\n') + '\n\n';
                        
                    case 'LI':
                        // These are handled by UL and OL processing
                        if (node.parentNode && 
                           (node.parentNode.nodeName === 'UL' || node.parentNode.nodeName === 'OL')) {
                            return '';
                        }
                        return Array.from(node.childNodes).map(processNode).join('');
                        
                    case 'H1':
                        return '# ' + Array.from(node.childNodes).map(processNode).join('') + '\n\n';
                    case 'H2':
                        return '## ' + Array.from(node.childNodes).map(processNode).join('') + '\n\n';
                    case 'H3':
                        return '### ' + Array.from(node.childNodes).map(processNode).join('') + '\n\n';
                    case 'H4':
                        return '#### ' + Array.from(node.childNodes).map(processNode).join('') + '\n\n';
                    case 'H5':
                        return '##### ' + Array.from(node.childNodes).map(processNode).join('') + '\n\n';
                    case 'H6':
                        return '###### ' + Array.from(node.childNodes).map(processNode).join('') + '\n\n';
                        
                    default:
                        // Handle LaTeX blocks
                        if (node.classList && (node.classList.contains('katex') || node.classList.contains('katex-display'))) {
                            try {
                                // Method 1: Try to find annotation
                                const annotation = node.querySelector('.katex-html annotation[encoding="application/x-tex"]');
                                if (annotation && annotation.textContent) {
                                    const latexSource = annotation.textContent;
                                    // Check if it's a display or inline equation
                                    const isDisplay = node.classList.contains('katex-display') || 
                                                   (node.parentNode && node.parentNode.classList && 
                                                    node.parentNode.classList.contains('katex-display'));
                                    
                                    return isDisplay ? '$$' + latexSource + '$$' : '$' + latexSource + '$';
                                }
                                
                                // Method 2: Look for data attributes
                                const mathml = node.querySelector('math[data-latex]');
                                if (mathml && mathml.getAttribute('data-latex')) {
                                    const latexSource = mathml.getAttribute('data-latex');
                                    const isDisplay = node.classList.contains('katex-display') || 
                                                   (node.parentNode && node.parentNode.classList && 
                                                    node.parentNode.classList.contains('katex-display'));
                                    
                                    return isDisplay ? '$$' + latexSource + '$$' : '$' + latexSource + '$';
                                }
                                
                                // Method 3: Look for .katex-mathml annotation
                                const mathmlText = node.querySelector('.katex-mathml annotation');
                                if (mathmlText && mathmlText.textContent) {
                                    const latexSource = mathmlText.textContent;
                                    const isDisplay = node.classList.contains('katex-display') || 
                                                   (node.parentNode && node.parentNode.classList && 
                                                    node.parentNode.classList.contains('katex-display'));
                                    
                                    return isDisplay ? '$$' + latexSource + '$$' : '$' + latexSource + '$';
                                }
                                
                                // Fallback
                                const isDisplay = node.classList.contains('katex-display') || 
                                               (node.parentNode && node.parentNode.classList && 
                                                node.parentNode.classList.contains('katex-display'));
                                return isDisplay ? '[Display LaTeX Equation]' : '[Inline LaTeX Equation]';
                            } catch (e) {
                                console.error('Error processing LaTeX:', e);
                                return '[LaTeX Equation Error]';
                            }
                        }
                        
                        // For other elements, just process children
                        return Array.from(node.childNodes).map(processNode).join('');
                }
            
            default:
                return '';
        }
    }
    
    // Find and extract messages from the conversation thread
    function extractMessages() {
        console.log("Starting ChatGPT conversation export...");
        
        // Find the main thread in the DOM
        const threadSelectors = [
            'div[id="__next"] main', // Main structure in newer versions
            'main div.flex.flex-col',
            '[role="presentation"]',
            'main .relative',
            'div#__next div.overflow-hidden', // Common wrapper
            'div.flex.flex-col.items-center.text-sm.h-full' // Another common pattern
        ];
        
        let mainThread = null;
        for (const selector of threadSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                mainThread = element;
                console.log(`Found main thread using selector: ${selector}`);
                break;
            }
        }
        
        if (!mainThread) {
            alert('Could not find the chat thread. Are you on the ChatGPT page?');
            return null;
        }
        
        // Find all conversation turns - these are messages from either user or assistant
        const turnSelectors = [
            '[data-testid^="conversation-turn-"]', // Modern GPT-4 structure
            'article[data-message-author-role]', // Another common pattern
            'div[data-message-author-role]', // Alternative
            'div.w-full.text-token-text-primary', // Older versions
            '.group[data-group-pos]',
            'div.text-base' // Fallback
        ];
        
        let conversationTurns = [];
        for (const selector of turnSelectors) {
            const elements = Array.from(mainThread.querySelectorAll(selector));
            if (elements.length > 0) {
                conversationTurns = elements;
                console.log(`Found ${elements.length} conversation turns using selector: ${selector}`);
                break;
            }
        }
        
        if (conversationTurns.length === 0) {
            alert('Could not find any messages. The page structure might have changed.');
            return null;
        }
        
        // Filter out nested turns (avoid duplicates)
        conversationTurns = conversationTurns.filter(turn => {
            return !conversationTurns.some(otherTurn => 
                otherTurn !== turn && otherTurn.contains(turn)
            );
        });
        
        console.log(`Found ${conversationTurns.length} unique conversation turns after filtering duplicates`);
        
        // Process each turn to extract messages and roles
        const messages = [];
        let userMessageCount = 0;
        let assistantMessageCount = 0;
        
        conversationTurns.forEach((turn, index) => {
            console.log(`Processing turn ${index + 1}/${conversationTurns.length}`);
            
            // Determine if this is a user or assistant message
            let role = 'unknown';
            
            // Method 1: Check data attribute
            const authorRole = turn.getAttribute('data-message-author-role');
            if (authorRole) {
                role = authorRole;
            } else {
                // Method 2: Look for specific elements or text
                const h5 = turn.querySelector('h5, h6');
                if (h5 && h5.textContent) {
                    if (h5.textContent.toLowerCase().includes('you said')) {
                        role = 'user';
                    } else if (h5.textContent.toLowerCase().includes('chatgpt') || 
                               h5.textContent.toLowerCase().includes('assistant')) {
                        role = 'assistant';
                    }
                }
                
                // Method 3: Check for icons
                if (role === 'unknown') {
                    const userIcon = turn.querySelector('img[alt*="User"], img[alt*="user"]');
                    const botIcon = turn.querySelector('img[alt*="ChatGPT"], img[alt*="GPT"], img[alt*="Assistant"]');
                    
                    if (userIcon && !botIcon) {
                        role = 'user';
                    } else if (botIcon && !userIcon) {
                        role = 'assistant';
                    }
                }
                
                // Method 4: Check for classes
                if (role === 'unknown') {
                    // User messages often have these classes
                    if (turn.classList.contains('dark:bg-gray-800') || 
                        turn.querySelector('.bg-token-message-surface') ||
                        Array.from(turn.classList).some(c => c.includes('user'))) {
                        role = 'user';
                    } 
                    // Assistant messages often have these classes
                    else if (turn.classList.contains('bg-gray-50') || 
                             turn.classList.contains('markdown') ||
                             Array.from(turn.classList).some(c => c.includes('assistant'))) {
                        role = 'assistant';
                    }
                }
                
                // Method 5: Alternating pattern (fallback)
                if (role === 'unknown') {
                    role = (index % 2 === 0) ? 'user' : 'assistant';
                }
            }
            
            // Find the content - look for specific content areas
            let contentElement = null;
            
            // Common content selectors
            const contentSelectors = [
                'div[data-message-text-content="true"]',
                'div.whitespace-pre-wrap',
                'div.markdown',
                '.prose',
                'div.flex.max-w-full.flex-col.grow',
                '.text-message'
            ];
            
            for (const selector of contentSelectors) {
                const element = turn.querySelector(selector);
                if (element) {
                    contentElement = element;
                    break;
                }
            }
            
            // If we still don't have content, try the turn itself
            if (!contentElement) {
                contentElement = turn;
            }
            
            // Look specifically for image containers at the turn level and process them separately
            let imageContent = '';
            
            // Find all possible image containers using multiple patterns
            const imageContainerSelectors = [
                '.group\\/imagegen-image', 
                '[style*="aspect-ratio"]',
                'div.grid.pb-2',
                'div.relative.overflow-hidden',
                'div[tabindex="0"][role="button"]'
            ];
            
            // Combine selectors for a comprehensive search
            const imageContainerSelector = imageContainerSelectors.join(', ');
            const imageContainers = turn.querySelectorAll(imageContainerSelector);
            
            if (imageContainers && imageContainers.length > 0) {
                console.log(`Found ${imageContainers.length} image containers in turn ${index + 1}`);
                
                // Process each image container
                imageContainers.forEach(container => {
                    const images = container.querySelectorAll('img');
                    if (images.length > 0) {
                        // Find the best quality image (non-blurred)
                        let bestImage = null;
                        for (const img of images) {
                            const parentStyle = img.parentNode && img.parentNode.style;
                            const hasBlur = parentStyle && 
                                         (parentStyle.filter?.includes('blur') || 
                                          img.parentNode.className?.includes('blur') ||
                                          img.parentNode.getAttribute('class')?.includes('blur'));
                                          
                            // Images in z-1 or z-2 divs are usually higher quality
                            const isHigherZ = img.parentNode && 
                                           (img.parentNode.classList.contains('z-1') || 
                                            img.parentNode.classList.contains('z-2'));
                                            
                            if (!hasBlur || isHigherZ) {
                                bestImage = img;
                                break;
                            }
                        }
                        
                        if (!bestImage) bestImage = images[0]; // Fallback
                        
                        const imgMarkdown = extractImageMarkdown(bestImage);
                        if (imgMarkdown) {
                            imageContent += imgMarkdown;
                        }
                    }
                });
            }
            
            // Process the main content to extract text and inline images
            let mainContent = processNode(contentElement);
            
            // Combine main content and image content
            let content = mainContent;
            
            // If we have image content but it's not already in the main content, append it
            if (imageContent && !content.includes(imageContent)) {
                content += imageContent;
            }
            
            // Clean up the content
            content = content.trim();
            content = content.replace(/\n{3,}/g, '\n\n'); // Normalize consecutive newlines
            
            if (content) {
                messages.push({
                    role: role,
                    content: content,
                    index: index
                });
                
                if (role === 'user') {
                    userMessageCount++;
                } else if (role === 'assistant') {
                    assistantMessageCount++;
                }
            }
        });
        
        console.log(`Extracted ${messages.length} messages: ${userMessageCount} user, ${assistantMessageCount} assistant`);
        console.log(`Found ${processedImageSrcs.size} unique images`);
        
        return {
            messages: messages,
            stats: {
                userCount: userMessageCount,
                assistantCount: assistantMessageCount,
                imageCount: processedImageSrcs.size
            }
        };
    }
    
    // Main function to export the conversation
    function exportConversation() {
        const result = extractMessages();
        if (!result) return;
        
        const { messages, stats } = result;
        
        // Generate markdown
        let markdown = `# ChatGPT Conversation Export\n\nExported on: ${new Date().toLocaleString()}\n\n`;
        
        messages.forEach(message => {
            const roleTitle = message.role === 'user' ? 'User' : 'ChatGPT';
            markdown += `## ${roleTitle}\n\n${message.content}\n\n`;
        });
        
        // Add a note if the distribution seems off
        if (stats.userCount === 0 || stats.assistantCount === 0) {
            console.warn("Warning: Only detected messages from one participant. The extraction might be incomplete.");
            markdown += "\n\n*Note: The export might be incomplete. Only detected messages from " + 
                      (stats.userCount > 0 ? "User" : "ChatGPT") + ".*\n";
        }
        
        // Create and trigger download
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chatgpt-conversation-${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('ChatGPT conversation exported successfully!');
        console.log(`Total messages: ${stats.userCount + stats.assistantCount} (${stats.userCount} user, ${stats.assistantCount} assistant)`);
        console.log(`Total unique images: ${stats.imageCount}`);
        
        return {
            messageCount: stats.userCount + stats.assistantCount,
            imageCount: stats.imageCount
        };
    }
    
    // Execute the export
    return exportConversation();
})();