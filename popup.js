document.addEventListener('DOMContentLoaded', function() {
  const exportCurrentButton = document.getElementById('export-current');
  const exportAllButton = document.getElementById('export-all');
  const statusDiv = document.getElementById('status');
  
  // Function to check if we're on a ChatGPT page
  function isChatGPTPage(tab) {
    return tab && tab.url && (tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com'));
  }
  
  // Function to ensure content script is injected before proceeding
  function ensureContentScriptInjected(callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        statusDiv.textContent = 'Error: No active tab found';
        return;
      }
      
      if (!isChatGPTPage(tabs[0])) {
        statusDiv.textContent = 'Error: Please navigate to ChatGPT first';
        return;
      }
      
      // Try to inject the content script first
      chrome.runtime.sendMessage(
        { action: 'injectContentScript' },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error injecting content script:', chrome.runtime.lastError);
            statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
            return;
          }
          
          if (response && response.success) {
            // Content script injected successfully, proceed with callback
            callback(tabs[0]);
          } else {
            // Injection failed
            const errorMsg = response && response.message ? response.message : 'Failed to prepare export';
            statusDiv.textContent = 'Error: ' + errorMsg;
          }
        }
      );
    });
  }
  
  // Export current conversation
  exportCurrentButton.addEventListener('click', function() {
    const markdownChecked = document.getElementById('markdown').checked;
    const htmlChecked = document.getElementById('html').checked;
    
    if (!markdownChecked && !htmlChecked) {
      statusDiv.textContent = 'Please select at least one export format';
      return;
    }
    
    statusDiv.textContent = 'Preparing to export...';
    
    ensureContentScriptInjected(function(tab) {
      statusDiv.textContent = 'Exporting current conversation...';
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'exportCurrent',
        formats: {
          markdown: markdownChecked,
          html: htmlChecked
        }
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Message sending error:', chrome.runtime.lastError);
          statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        
        if (response && response.success) {
          statusDiv.textContent = `Exported ${response.messageCount} messages with ${response.imageCount} images`;
        } else {
          const errorMsg = response && response.error ? response.error : 'Could not export conversation';
          statusDiv.textContent = 'Error: ' + errorMsg;
        }
      });
    });
  });
  
  // Export all conversations
  exportAllButton.addEventListener('click', function() {
    const markdownChecked = document.getElementById('markdown').checked;
    const htmlChecked = document.getElementById('html').checked;
    
    if (!markdownChecked && !htmlChecked) {
      statusDiv.textContent = 'Please select at least one export format';
      return;
    }
    
    statusDiv.textContent = 'Preparing to export...';
    
    ensureContentScriptInjected(function(tab) {
      statusDiv.textContent = 'Starting export of all conversations...';
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'exportAll',
        formats: {
          markdown: markdownChecked,
          html: htmlChecked
        }
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Message sending error:', chrome.runtime.lastError);
          statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        
        if (response && response.success) {
          if (response.message) {
            statusDiv.textContent = response.message;
          } else {
            statusDiv.textContent = `Exported ${response.conversationCount} conversations`;
          }
        } else {
          const errorMsg = response && response.error ? response.error : 'Could not export conversations';
          statusDiv.textContent = 'Error: ' + errorMsg;
        }
      });
    });
  });
});