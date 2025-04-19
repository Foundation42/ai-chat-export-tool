// Background script for AI Chat Export Tool

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Chat Export Tool v1.0.0 installed');
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.action);
  
  // Handle content script injection
  if (request.action === 'injectContentScript') {
    console.log('Received request to inject content script');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, message: 'No active tab found' });
        return;
      }
      
      const activeTab = tabs[0];
      
      // Check if we're on a supported AI chat page
      if (!activeTab.url || 
          !(activeTab.url.includes('chat.openai.com') || 
            activeTab.url.includes('chatgpt.com') ||
            activeTab.url.includes('claude.ai') ||
            activeTab.url.includes('gemini.google.com'))) {
        sendResponse({ 
          success: false, 
          message: 'Please navigate to a supported AI chat platform first'
        });
        return;
      }
      
      // Inject the content script
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js']
      })
      .then(() => {
        console.log('Content script injected successfully');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Error injecting content script:', error);
        sendResponse({ 
          success: false, 
          message: 'Failed to inject content script: ' + error.message
        });
      });
    });
    
    // Keep the messaging channel open for the async response
    return true;
  }
  
  // Handle file download requests
  if (request.action === 'downloadFile') {
    console.log('Received request to download file:', request.filename);
    
    try {
      chrome.downloads.download({
        url: request.url,
        filename: request.filename,
        saveAs: request.saveAs || false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
        } else {
          console.log('Download initiated with ID:', downloadId);
          sendResponse({ success: true, downloadId: downloadId });
        }
      });
    } catch (error) {
      console.error('Error initiating download:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
    
    // Keep the messaging channel open for the async response
    return true;
  }
});