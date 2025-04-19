// Guard to prevent script from running multiple times
if (typeof window.SocialMagneticsAIChatExportTool === 'undefined') {
  window.SocialMagneticsAIChatExportTool = true;
  console.log('AI Chat Export Tool by Social Magnetics loaded');

  // Set up message listeners
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'exportCurrent') {
      exportCurrentConversation(request.formats, sendResponse);
      return true; // Keep the messaging channel open for async response
    } else if (request.action === 'exportAll') {
      exportAllConversations(request.formats, sendResponse);
      return true; // Keep the messaging channel open for async response
    }
  });

  // Set to track images we've already processed to avoid duplicates
  let processedImageSrcs = new Set();

  // Helper function to extract image details
  function extractImageMarkdown(imgElement) {
    if (!imgElement) return '';

    const src = imgElement.getAttribute('src');
    if (!src || processedImageSrcs.has(src)) {
      return ''; // Skip if already processed
    }

    // Only process images from valid domains (oaiusercontent.com or other trusted sources)
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
        const isImageContainer =
          (node.classList && (
            node.classList.contains('group\/imagegen-image') ||
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
            let language = '';
            // Improved language extraction: find the class starting with "language-"
            if (codeNode && codeNode.className) {
              const langClass = codeNode.className.split(' ').find(cls => cls.startsWith('language-'));
              if (langClass) {
                language = langClass.replace('language-', '');
              }
            }
            const code = codeNode ? codeNode.textContent : node.textContent;
            // Ensure newline after language, handle potential empty language
            const langPart = language ? language + '\n' : '\n';
            return '```' + langPart + code + '\n```\n\n';

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

  // Detect which AI platform we're on
  function detectAIPlatform() {
    const url = window.location.href.toLowerCase();
    
    if (url.includes('claude.ai')) {
      return 'claude';
    } else if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
      return 'chatgpt';
    } else if (url.includes('gemini.google.com')) {
      return 'gemini';
    }
    
    // Fallback detection through page elements
    if (document.querySelector('[data-theme="claude"]') || 
        document.querySelector('.font-claude-message')) {
      return 'claude';
    }
    
    // Default to ChatGPT extraction if we can't determine
    return 'chatgpt';
  }

  // Find and extract messages from the conversation thread
  function extractMessages() {
    console.log("Starting AI chat conversation export...");
    
    // Detect the current platform
    const platform = detectAIPlatform();
    console.log(`Detected AI platform: ${platform}`);
    
    // Use platform-specific extractor
    if (platform === 'claude' && typeof window.ClaudeExtractor !== 'undefined') {
      console.log("Using Claude-specific extraction logic");
      const claudeResult = window.ClaudeExtractor.extractMessages();
      
      // If extraction failed, return null so we can fall back to default
      if (!claudeResult) {
        console.log("Claude extraction failed, falling back to default extraction");
        return null;
      }
      
      return claudeResult;
    }
    
    // For ChatGPT or fallback to default extraction for other platforms

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
      console.error('Could not find the chat thread');
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
      console.error('Could not find any messages');
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

  // Convert markdown to HTML with improved LaTeX handling
  function convertMarkdownToHTML(markdown) {
    // Get platform info
    const platform = detectAIPlatform();
    const isClaudeConversation = platform === 'claude';
    
    // Create wrapper elements for HTML structure
    const wrapMessage = (content, role) => {
      return `<div class="${role}">${content}</div>`;
    };

    // Extract user and assistant messages
    // Create a regex pattern that matches standard headers and platform-specific headers
    const parts = markdown.split(/^## (User|Assistant|Human|Claude)\s*$/gm);
    let html = '';

    // Process each message
    for (let i = 1; i < parts.length; i += 2) {
      if (i + 1 < parts.length) {
        const role = parts[i].trim().toLowerCase();
        const content = parts[i + 1].trim();

        // Parse the markdown content
        let messageHtml = convertMessageContent(content);

        // Determine the role for the message
        let messageRole = 'assistant';
        if (role === 'user' || role === 'human') {
          messageRole = 'user';
        }
        
        // Wrap the message in a div with the appropriate role class
        html += wrapMessage(messageHtml, messageRole);
      }
    }

    // Get metadata from the result for proper HTML generation
    const metadata = result.metadata || {};
    
    // Create the complete HTML document
    const htmlTemplate = createHtmlTemplate(html, metadata);
    return htmlTemplate;
  }

  // Helper function to convert message content from markdown to HTML
  function convertMessageContent(content) {
    // 1. Extract and temporarily replace code blocks and inline code with placeholders
    let codeBlocks = [];
    content = content.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)\n?```/g, (match, lang, code) => {
      const placeholder = `CODE_BLOCK_${codeBlocks.length}`;
      codeBlocks.push({ lang, code });
      return placeholder;
    });

    let inlineCodes = [];
    content = content.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `INLINE_CODE_${inlineCodes.length}`;
      inlineCodes.push(code);
      return placeholder;
    });

    // 2. Extract and temporarily replace LaTeX with placeholders
    let latexDisplays = [];
    content = content.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
      const placeholder = `LATEX_DISPLAY_${latexDisplays.length}`;
      latexDisplays.push(latex);
      return placeholder;
    });

    let latexInlines = [];
    // Use a more specific regex for inline LaTeX to avoid false positives
    content = content.replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (match, latex) => {
      const placeholder = `LATEX_INLINE_${latexInlines.length}`;
      latexInlines.push(latex);
      return placeholder;
    });

    // 3. Process regular markdown to HTML
    let html = content
      // Replace headings
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
      .replace(/^###### (.+)$/gm, '<h6>$1</h6>');

    // Replace images with clean src to avoid ${src} errors
    html = html.replace(/!\[(.*?)\]\((.*?)\)( *<!-- .*? -->)?/g, (match, alt, src) => {
      const cleanSrc = src.replace(/\${.*?}/g, '');
      return `<img src="${cleanSrc}" alt="${alt}" style="max-width:100%">`;
    });

    // Replace links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Replace emphasis
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Handle lists
    let inList = false;
    let listType = '';
    const lines = html.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Unordered lists
      if (lines[i].match(/^- (.+)$/)) {
        if (!inList) {
          lines[i] = '<ul>\n<li>' + lines[i].replace(/^- (.+)$/, '$1') + '</li>';
          inList = true;
          listType = 'ul';
        } else if (listType === 'ul') {
          lines[i] = '<li>' + lines[i].replace(/^- (.+)$/, '$1') + '</li>';
        } else {
          lines[i] = '</ol>\n<ul>\n<li>' + lines[i].replace(/^- (.+)$/, '$1') + '</li>';
          listType = 'ul';
        }
      }
      // Ordered lists
      else if (lines[i].match(/^\d+\. (.+)$/)) {
        if (!inList) {
          lines[i] = '<ol>\n<li>' + lines[i].replace(/^\d+\. (.+)$/, '$1') + '</li>';
          inList = true;
          listType = 'ol';
        } else if (listType === 'ol') {
          lines[i] = '<li>' + lines[i].replace(/^\d+\. (.+)$/, '$1') + '</li>';
        } else {
          lines[i] = '</ul>\n<ol>\n<li>' + lines[i].replace(/^\d+\. (.+)$/, '$1') + '</li>';
          listType = 'ol';
        }
      }
      // End lists when encountering a non-list item
      else if (inList && lines[i].trim() !== '') {
        lines[i] = (listType === 'ul' ? '</ul>' : '</ol>') + '\n' + lines[i];
        inList = false;
      }
    }

    // Close any remaining lists
    if (inList) {
      lines.push(listType === 'ul' ? '</ul>' : '</ol>');
    }

    html = lines.join('\n');

    // Now we restore code blocks BEFORE paragraph replacements to avoid wrapping
    // code blocks in <p> tags

    // 4. Restore code blocks with proper HTML and escaping
    for (let i = 0; i < codeBlocks.length; i++) {
      const { lang, code } = codeBlocks[i];

      // Escape HTML in code blocks for security
      const escapedCode = code.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      // Only add language class if a language is specified
      const langClass = lang ? `language-${lang}` : '';

      // Create a pretty language label for the UI
      const displayLang = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Plain text';

      // Create the code block with a language attribute for the label
      html = html.replace(
        `CODE_BLOCK_${i}`,
        `<pre data-language="${displayLang}"><code class="${langClass}">${escapedCode}</code></pre>`
      );
    }

    // Restore inline code with proper HTML and escaping
    for (let i = 0; i < inlineCodes.length; i++) {
      const escapedCode = inlineCodes[i].replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      html = html.replace(`INLINE_CODE_${i}`, `<code>${escapedCode}</code>`);
    }

    // NOW do paragraph replacements AFTER code blocks are restored
    // Replace paragraphs (do this last to avoid messing up other elements)
    html = html.replace(/\n\n([^<].*?)\n\n/g, '\n<p>$1</p>\n');

    // Clean any leftover newlines
    html = html.replace(/\n\n+/g, '\n\n');

    // 5. Restore LaTeX with special CSS classes for easy identification
    for (let i = 0; i < latexDisplays.length; i++) {
      let latex = latexDisplays[i];

      // Fix common LaTeX issues
      latex = fixLatexSyntax(latex);

      html = html.replace(
        `LATEX_DISPLAY_${i}`,
        `<div class="math-display" data-latex-original="${escapeHtml(latex)}">\\[${latex}\\]</div>`
      );
    }

    for (let i = 0; i < latexInlines.length; i++) {
      let latex = latexInlines[i];

      // Fix common LaTeX issues
      latex = fixLatexSyntax(latex);

      html = html.replace(
        `LATEX_INLINE_${i}`,
        `<span class="math-inline" data-latex-original="${escapeHtml(latex)}">\\(${latex}\\)</span>`
      );
    }

    return html;
  }

  // Helper function to fix common LaTeX syntax issues
  function fixLatexSyntax(latex) {
    // Fix unmatched \left and \right
    let fixed = latex;

    // Count opening and closing delimiters
    const leftCount = (fixed.match(/\\left/g) || []).length;
    const rightCount = (fixed.match(/\\right/g) || []).length;

    // Fix unmatched \left
    if (leftCount > rightCount) {
      for (let i = 0; i < leftCount - rightCount; i++) {
        fixed += ' \\right.';
      }
    }

    // Fix unmatched \right
    if (rightCount > leftCount) {
      fixed = '\\left. ' + fixed;
    }

    // Fix common vector notation
    fixed = fixed.replace(/\\vec\s*([a-zA-Z])\b(?![{])/g, '\\vec{$1}');

    // Fix common \frac syntax
    fixed = fixed.replace(/\\frac\s*([a-zA-Z0-9]+)\s*([a-zA-Z0-9]+)/g, '\\frac{$1}{$2}');

    // Balance braces
    let openBraces = 0;
    for (let i = 0; i < fixed.length; i++) {
      if (fixed[i] === '{') openBraces++;
      if (fixed[i] === '}') openBraces--;
    }

    // Add missing closing braces
    if (openBraces > 0) {
      fixed += '}'.repeat(openBraces);
    }

    // Add missing opening braces
    if (openBraces < 0) {
      fixed = '{'.repeat(-openBraces) + fixed;
    }

    return fixed;
  }

  // Helper function to escape HTML for attributes
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Function to create the complete HTML template
  function createHtmlTemplate(content, exportMetadata) {
    // Get metadata that was passed from the export function
    const metadata = exportMetadata || {};
    const platform = metadata.platform || detectAIPlatform();
    const platformName = metadata.platformName || (platform === 'claude' ? 'Claude' : null);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Conversation</title>
  
  <!-- MathJax for LaTeX rendering -->
  <script>
  window.MathJax = {
    tex: {
      inlineMath: [['\\\\(', '\\\\)']],
      displayMath: [['\\\\[', '\\\\]']],
      processEscapes: true,
      processEnvironments: true,
      macros: {
        // Define some helpful macros for common LaTeX commands
        vec: ["\\\\mathbf{#1}", 1],  // Simplified vector macro without \boldsymbol
        ket: ["\\\\left| #1 \\\\right\\\\rangle", 1],
        bra: ["\\\\left\\\\langle #1 \\\\right|", 1]
      },
      packages: {
        '[+]': ['ams', 'bm', 'color', 'noerrors', 'physics']
      }
    },
    chtml: {  // Use CommonHTML output for sharper text
      fontCache: 'global',
      scale: 1.2,  // Slightly larger scale for better readability
      minScale: 0.5  // Allow small scale for inline equations
    },
    options: {
      // Be more tolerant of errors in LaTeX
      ignoreDuplicateLabels: true,
      throwOnError: false  // Continue processing even with errors
    },
    startup: {
      ready: function() {
        MathJax.startup.defaultReady();
        console.log('MathJax ready');
      }
    }
  };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  
  <!-- Syntax highlighting with common language support -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <!-- Common language packs for better code highlighting -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/typescript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/bash.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/cpp.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/csharp.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/css.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/json.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/xml.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/markdown.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/sql.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/java.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/go.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/rust.min.js"></script>
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #24292e;
    }
    
    .user, .assistant {
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 10px;
    }
    
    .user {
      background-color: #f6f8fa;
      border-left: 4px solid #0366d6;
    }
    
    .assistant {
      background-color: #f1f8ff;
      border-left: 4px solid #28a745;
    }
    
    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      margin: 10px 0;
      border: 1px solid #e1e4e8;
    }
    
    pre {
      background-color: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 16px 0;
      position: relative;
    }
    
    /* Add language label to code blocks */
    pre::before {
      content: attr(data-language);
      position: absolute;
      top: 0;
      right: 0;
      padding: 2px 8px;
      font-size: 12px;
      color: #6a737d;
      background-color: rgba(246, 248, 250, 0.9);
      border-radius: 0 6px;
      border-left: 1px solid #e1e4e8;
      border-bottom: 1px solid #e1e4e8;
    }
    
    code {
      font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 85%;
      padding: 0.2em 0.4em;
      background-color: rgba(27, 31, 35, 0.05);
      border-radius: 3px;
    }
    
    /* Style for inline code with language label */
    .code-lang-wrapper {
      position: relative;
      display: inline-block;
      margin: 0 0.2em;
    }
    
    .code-lang-wrapper::after {
      content: attr(data-lang);
      position: absolute;
      top: -0.7em;
      right: -0.2em;
      font-size: 0.7em;
      padding: 0 0.3em;
      background: #eff1f3;
      border-radius: 3px;
      color: #6a737d;
      border: 1px solid #e1e4e8;
      opacity: 0; /* Hidden by default */
      transition: opacity 0.2s;
    }
    
    .code-lang-wrapper:hover::after {
      opacity: 1; /* Show on hover */
    }
    
    pre code {
      padding: 0;
      background-color: transparent;
      font-size: 14px;
      line-height: 1.5;
    }
    
    /* Custom syntax highlighting for both light and dark mode */
    /* Light mode highlighting */
    .hljs {
      display: block;
      color: #24292e;
      background: #f6f8fa;
    }
    
    .hljs-keyword {
      color: #d73a49;
      font-weight: bold;
    }
    
    .hljs-string {
      color: #032f62;
    }
    
    .hljs-comment {
      color: #6a737d;
      font-style: italic;
    }
    
    .hljs-function {
      color: #6f42c1;
    }
    
    .hljs-number {
      color: #005cc5;
    }
    
    .hljs-attr {
      color: #6f42c1;
    }
    
    .hljs-name, .hljs-tag {
      color: #22863a;
    }
    
    .hljs-built_in {
      color: #e36209;
    }
    
    h1 {
      font-size: 2em;
      margin-top: 24px;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
    }
    
    h2 {
      font-size: 1.5em;
      color: #24292e;
      margin-top: 24px;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
    }
    
    a {
      color: #0366d6;
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eaecef;
      color: #586069;
      font-size: 12px;
      text-align: center;
    }
    
    /* LaTeX rendering improvements */
    .math-display {
      text-align: center;
      margin: 1em 0;
      overflow-x: auto;
      padding: 8px;
      border-radius: 4px;
      background-color: rgba(0, 0, 0, 0.02);
    }
    
    .math-inline {
      display: inline-block;
      margin: 0 0.15em;
    }
    
    /* Style the MathJax output for better appearance */
    .MathJax {
      font-size: 115% !important;
    }
    
    /* Improve equation display */
    mjx-container {
      overflow-x: auto;
      overflow-y: hidden;
      max-width: 100%;
      padding: 2px 0;
    }
    
    /* Add a debug viewer for LaTeX (hidden by default) */
    .latex-debug {
      display: none;
      padding: 8px;
      margin-top: 4px;
      background-color: #ffe;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-wrap;
      font-size: 12px;
    }
    
    /* Show debug info when hovering over LaTeX elements */
    .math-display:hover .latex-debug,
    .math-inline:hover .latex-debug {
      display: block;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #0d1117;
        color: #c9d1d9;
      }
      
      .user {
        background-color: #161b22;
        border-left-color: #58a6ff;
      }
      
      .assistant {
        background-color: #0d1117;
        border-left-color: #2ea043;
      }

      pre, pre.hljs, code.hljs { /* Target all code elements */
        background-color: #161b22 !important; /* Ensure dark background persists */
        color: #c9d1d9 !important;
      }
      
      pre {
        background-color: #161b22;
        border: 1px solid #30363d;
      }
      
      /* Ensure code blocks maintain dark styling */
      pre code {
        background-color: transparent !important;
        color: #c9d1d9 !important;
      }
      
      pre::before {
        color: #8b949e;
        background-color: rgba(22, 27, 34, 0.9);
        border-left: 1px solid #30363d;
        border-bottom: 1px solid #30363d;
      }
      
      code {
        background-color: rgba(240, 246, 252, 0.15);
      }
      
      /* Dark mode for inline code language labels */
      .code-lang-wrapper::after {
        background: #2d333b;
        color: #adbac7;
        border-color: #444c56;
      }
      
      /* Dark mode syntax highlighting - override light theme */
      .hljs {
        background-color: #161b22 !important;
        color: #c9d1d9 !important;
      }
      
      .hljs-keyword {
        color: #ff7b72 !important;
      }
      
      .hljs-string {
        color: #a5d6ff !important;
      }
      
      .hljs-comment {
        color: #8b949e !important;
      }
      
      .hljs-function {
        color: #d2a8ff !important;
      }
      
      .hljs-number {
        color: #79c0ff !important;
      }
      
      .hljs-attr {
        color: #d2a8ff !important;
      }
      
      .hljs-name, .hljs-tag {
        color: #7ee787 !important;
      }
      
      .hljs-built_in {
        color: #ffa657 !important;
      }
      
      a {
        color: #58a6ff;
      }
      
      h2 {
        color: #c9d1d9;
        border-bottom-color: #21262d;
      }
      
      .footer {
        border-top-color: #21262d;
        color: #8b949e;
      }
      
      .math-display {
        background-color: rgba(255, 255, 255, 0.05);
      }
      
      .latex-debug {
        background-color: #2d2d1e;
        border-color: #444;
        color: #ddd;
      }
    }
  </style>
</head>
<body>
  <h1>${metadata.claudeVersion ? metadata.claudeVersion + ' Conversation' : 'AI Chat Conversation'}</h1>
  <p>Exported on: ${new Date().toLocaleString()}</p>
  
  <div class="conversation-container">
    ${content}
  </div>
  
  <div class="footer">
    <p>Exported with AI Chat Export Tool by Social Magnetics • ${new Date().toISOString().split('T')[0]}${platform !== 'chatgpt' ? ' • Platform: ' + (metadata.platformName || platformName || platform) : ''}</p>
  </div>

  <script>
    // Initialize syntax highlighting and handle typesetting
    document.addEventListener('DOMContentLoaded', function() {
      // Check if we're in dark mode
      const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log('Dark mode detected:', isDarkMode);
      
      // Function to apply dark mode to code blocks that might have been missed
      function ensureDarkModeForCode() {
        if (isDarkMode) {
          document.querySelectorAll('pre, code, .hljs').forEach(el => {
            if (el.tagName === 'PRE') {
              el.style.backgroundColor = '#161b22';
            } else {
              if (el.classList.contains('hljs')) {
                el.style.backgroundColor = '#161b22';
                el.style.color = '#c9d1d9';
              }
            }
          });
        }
      }
      
      // Apply syntax highlighting to all code blocks
      // This will attempt auto-detection for blocks without a language class
      document.querySelectorAll('pre code').forEach(function(block) {
        // For code blocks with a specific language
        if (block.className.startsWith('language-')) {
          // Get the language from the class
          const lang = block.className.replace('language-', '');
          // If lang is empty, do autodetection
          if (lang) {
            try {
              hljs.highlightElement(block);
            } catch (e) {
              console.warn('Failed to highlight with specified language', e);
              hljs.highlightAuto(block); // Fallback to auto detection
            }
          } else {
            hljs.highlightAuto(block);
          }
        } else {
          // For code blocks without a language class, use auto-detection
          hljs.highlightAuto(block);
        }
      });
      
      // Apply dark mode styling immediately after highlighting
      ensureDarkModeForCode();
      
      // Also apply dark mode periodically to catch any elements that might be modified
      setTimeout(ensureDarkModeForCode, 500);
      setTimeout(ensureDarkModeForCode, 1000);
      // Final check after all other operations should be complete
      setTimeout(ensureDarkModeForCode, 2000);
      
      // Also highlight inline code blocks with language specification
      document.querySelectorAll('code[class^="language-"]').forEach(function(el) {
        if (!el.closest('pre')) { // Only target inline code, not code blocks
          try {
            hljs.highlightElement(el);
          } catch (e) {
            console.warn('Failed to highlight inline code', e);
          }
          
          // Add a subtle label to show the language
          const lang = el.className.replace('language-', '');
          if (lang) {
            const wrapper = document.createElement('span');
            wrapper.className = 'code-lang-wrapper';
            wrapper.setAttribute('data-lang', lang.charAt(0).toUpperCase() + lang.slice(1));
            
            // Replace the element with the wrapped version
            el.parentNode.insertBefore(wrapper, el);
            wrapper.appendChild(el);
            
            // Apply dark mode to this element if needed
            if (isDarkMode && el.classList.contains('hljs')) {
              el.style.backgroundColor = '#161b22';
              el.style.color = '#c9d1d9';
            }
          }
        }
      });
      
      // Set up a listener for dark mode changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        const newDarkMode = e.matches;
        console.log('Dark mode changed to:', newDarkMode);
        if (newDarkMode) {
          ensureDarkModeForCode();
        }
      });
      
      // Add debug info to LaTeX elements
      document.querySelectorAll('.math-display, .math-inline').forEach(function(el) {
        // Get the original LaTeX from data attribute
        const original = el.getAttribute('data-latex-original');
        if (original) {
          // Create a debug element that shows the original LaTeX
          const debug = document.createElement('div');
          debug.className = 'latex-debug';
          debug.textContent = original;
          el.appendChild(debug);
        }
      });
      
      // Wait for MathJax to be fully loaded
      function checkMathJax() {
        if (typeof MathJax !== 'undefined' && MathJax.typeset) {
          console.log('Triggering MathJax typesetting...');
          try {
            MathJax.typeset();
            
            // Add debug info to any LaTeX elements that had errors
            document.querySelectorAll('.mjx-math').forEach(function(mathEl) {
              const parentEl = mathEl.closest('.math-display, .math-inline');
              if (parentEl && !parentEl.querySelector('.latex-debug')) {
                const original = parentEl.getAttribute('data-latex-original');
                if (original) {
                  const debug = document.createElement('div');
                  debug.className = 'latex-debug';
                  debug.textContent = original;
                  parentEl.appendChild(debug);
                }
              }
            });
            
            // Run MathJax a second time after a delay to catch anything that might have been missed
            setTimeout(function() {
              try {
                MathJax.typeset();
                console.log('Final MathJax typesetting complete');
              } catch (e) {
                console.error('Final MathJax typesetting error:', e);
              }
            }, 2000);
          } catch (e) {
            console.error('MathJax typesetting error:', e);
          }
        } else {
          console.log('Waiting for MathJax to load...');
          setTimeout(checkMathJax, 500);
        }
      }
      
      // Start checking for MathJax
      checkMathJax();
    });
  </script>
</body>
</html>`;
  }

  // Function to export the current conversation
  function exportCurrentConversation(formats, sendResponse) {
    try {
      console.log('Starting export of current conversation...');

      // Reset the processed images set
      processedImageSrcs.clear();

      // Extract the conversation
      const result = extractMessages();
      console.log('Extract messages result:', result ? 'Success' : 'Failed');

      if (!result) {
        console.error('Failed to extract conversation - no result returned');
        sendResponse({ success: false, error: 'Failed to extract conversation' });
        return;
      }

      const { messages, stats } = result;
      console.log(`Extracted ${messages.length} messages with ${stats.imageCount} images`);

      // Get platform-specific metadata for proper formatting
      const metadata = result.metadata || {};
      const platform = metadata.platform || detectAIPlatform();
      
      // Set appropriate title and labels based on platform and metadata
      let title = '# AI Chat Conversation';
      let userLabel = metadata.userLabel || 'User';
      let assistantLabel = metadata.assistantLabel || 'Assistant';
      
      // Handle platform-specific title (Claude, Gemini, etc.)
      if (platform === 'claude' && metadata.claudeVersion) {
        title = `# ${metadata.claudeVersion} Conversation`;
      }
      
      let markdown = `${title}\n\nExported on: ${new Date().toLocaleString()}\n\n`;

      messages.forEach(message => {
        const roleTitle = message.role === 'user' ? userLabel : assistantLabel;

        // Protect code blocks and inline code from LaTeX processing
        let content = message.content;

        // First, temporarily mark code blocks to prevent modifying them
        let codeBlocks = [];
        content = content.replace(/```[\s\S]*?```/g, (match) => {
          const placeholder = `CODE_BLOCK_${codeBlocks.length}`;
          codeBlocks.push(match);
          return placeholder;
        });

        // Now mark inline code to protect it as well
        let inlineCodes = [];
        content = content.replace(/`[^`]+`/g, (match) => {
          const placeholder = `INLINE_CODE_${inlineCodes.length}`;
          inlineCodes.push(match);
          return placeholder;
        });

        // Now restore all code blocks and inline codes
        codeBlocks.forEach((block, i) => {
          content = content.replace(`CODE_BLOCK_${i}`, block);
        });

        inlineCodes.forEach((code, i) => {
          content = content.replace(`INLINE_CODE_${i}`, code);
        });

        markdown += `## ${roleTitle}\n\n${content}\n\n`;
      });

      console.log('Generated markdown content:', markdown.substring(0, 100) + '...');

      // Use a Promise chain to handle downloads sequentially
      let downloadPromise = Promise.resolve();

      // Handle Markdown export
      if (formats.markdown) {
        downloadPromise = downloadPromise.then(() => {
          return new Promise((resolve) => {
            console.log('Creating markdown download...');
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);

            // Create filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace('T', '_').slice(0, 19);
            // Get the platform from metadata or detect it
            const metadata = result.metadata || {};
            const platform = metadata.platform || detectAIPlatform();
            const platformPrefix = platform === 'claude' ? 'claude' : 'ai-chat';
            const filename = `${platformPrefix}-conversation-${timestamp}.md`;

            // Send download request to background script
            chrome.runtime.sendMessage({
              action: 'downloadFile',
              url: url,
              filename: filename,
              saveAs: true
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error sending download request:', chrome.runtime.lastError);
              } else if (!response || !response.success) {
                console.error('Markdown download error:', response ? response.error : 'Unknown error');
              } else {
                console.log('Markdown download initiated with ID:', response.downloadId);
              }
              // Clean up object URL after a short delay to ensure it's used
              setTimeout(() => {
                URL.revokeObjectURL(url);
              }, 1000);
              resolve();
            });
          });
        });
      }

      // Handle HTML export
      if (formats.html) {
        downloadPromise = downloadPromise.then(() => {
          return new Promise((resolve) => {
            console.log('Creating HTML download...');
            const html = convertMarkdownToHTML(markdown);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);

            // Create filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace('T', '_').slice(0, 19);
            // Get the platform from metadata or detect it
            const metadata = result.metadata || {};
            const platform = metadata.platform || detectAIPlatform();
            const platformPrefix = platform === 'claude' ? 'claude' : 'ai-chat';
            const filename = `${platformPrefix}-conversation-${timestamp}.html`;

            // Send download request to background script
            chrome.runtime.sendMessage({
              action: 'downloadFile',
              url: url,
              filename: filename,
              saveAs: true
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error sending download request:', chrome.runtime.lastError);
              } else if (!response || !response.success) {
                console.error('HTML download error:', response ? response.error : 'Unknown error');
              } else {
                console.log('HTML download initiated with ID:', response.downloadId);
              }
              // Clean up object URL after a short delay to ensure it's used
              setTimeout(() => {
                URL.revokeObjectURL(url);
              }, 1000);
              resolve();
            });
          });
        });
      }

      // Send success response after all downloads have been processed
      downloadPromise.then(() => {
        console.log('Export process completed successfully');
        sendResponse({
          success: true,
          messageCount: messages.length,
          imageCount: stats.imageCount
        });
      }).catch((err) => {
        console.error('Download promise chain error:', err);
        sendResponse({ success: false, error: err.message || 'Error during download process' });
      });

    } catch (error) {
      console.error('Error exporting conversation:', error);
      sendResponse({ success: false, error: error.message || 'Unknown export error' });
    }

    // Must return true to indicate we'll send the response asynchronously
    return true;
  }

  // Function to export all conversations
  function exportAllConversations(formats, sendResponse) {
    try {
      console.log('Starting export of all conversations (currently in development)...');

      // This is a more complex feature that would require navigating to each conversation
      // For now, we'll just simulate the functionality with a response
      setTimeout(() => {
        console.log('Returning placeholder response for exportAll');
        sendResponse({
          success: true,
          conversationCount: 1, // For testing
          message: "This feature is under development. Currently only exporting the current conversation."
        });
      }, 500);

      /* In a full implementation, this would involve:
       * 1. Finding the conversation list
       * 2. Iterating through each conversation link
       * 3. Opening each conversation and extracting contents
       * 4. Creating a zip file with all conversations
       */
    } catch (error) {
      console.error('Error in exportAllConversations:', error);
      sendResponse({ success: false, error: error.message || 'Unknown error in export all' });
    }

    // Must return true to indicate we'll send the response asynchronously
    return true;
  }
}