// Set up message listeners
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'exportCurrent') {
    exportCurrentConversation(request.formats, sendResponse);
    return true; // Keep the messaging channel open for async response
  } else if (request.action === 'exportAll') {
    exportAllConversations(request.formats, sendResponse);
    return true; // Keep the messaging channel open for async response
  }
});

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

// Convert markdown to HTML
function convertMarkdownToHTML(markdown) {
  // This is a simplified conversion - in a full extension, use a library like marked or showdown
  
  // Replace headings
  let html = markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    
  // Replace images
  html = html.replace(/!\[(.*?)\]\((.*?)\)( *<!-- .*? -->)?/g, '<img src="$2" alt="$1" style="max-width:100%">');
  
  // Replace links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  
  // Replace emphasis
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Replace inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Replace code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, '<pre><code class="language-$1">$2</code></pre>');
  
  // Replace lists
  let inList = false;
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Unordered lists
    if (lines[i].match(/^- (.+)$/)) {
      if (!inList) {
        lines[i] = '<ul>\n<li>' + lines[i].replace(/^- (.+)$/, '$1') + '</li>';
        inList = 'ul';
      } else if (inList === 'ul') {
        lines[i] = '<li>' + lines[i].replace(/^- (.+)$/, '$1') + '</li>';
      } else {
        lines[i] = '</ol>\n<ul>\n<li>' + lines[i].replace(/^- (.+)$/, '$1') + '</li>';
        inList = 'ul';
      }
    }
    // Ordered lists
    else if (lines[i].match(/^\d+\. (.+)$/)) {
      if (!inList) {
        lines[i] = '<ol>\n<li>' + lines[i].replace(/^\d+\. (.+)$/, '$1') + '</li>';
        inList = 'ol';
      } else if (inList === 'ol') {
        lines[i] = '<li>' + lines[i].replace(/^\d+\. (.+)$/, '$1') + '</li>';
      } else {
        lines[i] = '</ul>\n<ol>\n<li>' + lines[i].replace(/^\d+\. (.+)$/, '$1') + '</li>';
        inList = 'ol';
      }
    }
    // End lists when encountering a non-list item
    else if (inList && lines[i].trim() !== '') {
      lines[i] = (inList === 'ul' ? '</ul>' : '</ol>') + '\n' + lines[i];
      inList = false;
    }
  }
  if (inList) {
    lines.push(inList === 'ul' ? '</ul>' : '</ol>');
  }
  html = lines.join('\n');
  
  // Replace paragraphs (do this last to avoid messing up other elements)
  html = html.replace(/\n\n([^<].*?)\n\n/g, '\n<p>$1</p>\n');
  
  // Replace leading newlines 
  html = html.replace(/^\n+/, '');
  
  // Add styling and MathJax for LaTeX rendering
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatGPT Conversation</title>
  
  <!-- MathJax for LaTeX rendering -->
  <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        processEscapes: true
      },
      svg: {
        fontCache: 'global'
      }
    };
  </script>
  
  <!-- Syntax highlighting for code -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', (event) => {
      document.querySelectorAll('pre code').forEach((el) => {
        hljs.highlightElement(el);
      });
    });
  </script>
  
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
    }
    code {
      font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 85%;
      padding: 0.2em 0.4em;
      background-color: rgba(27, 31, 35, 0.05);
      border-radius: 3px;
    }
    pre code {
      padding: 0;
      background-color: transparent;
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
  </style>
</head>
<body>
  <h1>ChatGPT Conversation</h1>
  <p>Exported on: ${new Date().toLocaleString()}</p>
  
  ${html}
  
  <div class="footer">
    <p>Exported with ChatGPT Export Tool • ${new Date().toISOString().split('T')[0]}</p>
  </div>
  
  <script>
    // Process any code blocks with highlighting
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    });
  </script>
</body>
</html>`;
}

// Pack downloaded images and files into a zip file
async function downloadZip(files, zipName) {
  // In a real extension, use JSZip or similar library
  // For this example, we're just going to highlight that this would be implemented
  // in the final version
  console.log(`Would create zip file ${zipName} with ${files.length} files`);
  files.forEach(file => {
    console.log(`  - ${file.path}: ${file.content.substring(0, 30)}...`);
  });
  
  // In a real implementation we would create a zip file and trigger download
  return {
    success: true,
    message: `Created ${files.length} files in zip`
  };
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
    
    // Generate markdown
    let markdown = `# ChatGPT Conversation\n\nExported on: ${new Date().toLocaleString()}\n\n`;
    
    messages.forEach(message => {
      const roleTitle = message.role === 'user' ? 'User' : 'ChatGPT';
      markdown += `## ${roleTitle}\n\n${message.content}\n\n`;
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
          const filename = `chatgpt-conversation-${timestamp}.md`;
          
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
          const filename = `chatgpt-conversation-${timestamp}.html`;
          
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