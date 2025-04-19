document.addEventListener('DOMContentLoaded', function() {
  const exportCurrentButton = document.getElementById('export-current');
  const exportAllButton = document.getElementById('export-all');
  const statusDiv = document.getElementById('status');
  
  // Function to update status with appropriate styling
  function updateStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (isError ? 'error' : '');
  }
  
  // Show success message with animation
  function showSuccess(message) {
    statusDiv.textContent = message;
    statusDiv.className = 'status success';
    setTimeout(() => {
      statusDiv.classList.add('fade');
    }, 3000);
  }
  
  // Function to check if we're on a supported AI chat platform
  function isSupportedAIChatPage(tab) {
    return tab && tab.url && (
      tab.url.includes('chat.openai.com') || 
      tab.url.includes('chatgpt.com') ||
      tab.url.includes('claude.ai') ||
      tab.url.includes('gemini.google.com')
    );
  }
  
  // Function to ensure content script is injected before proceeding
  function ensureContentScriptInjected(callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        updateStatus('Error: No active tab found', true);
        return;
      }
      
      if (!isSupportedAIChatPage(tabs[0])) {
        updateStatus('Please navigate to a supported AI chat platform first', true);
        return;
      }
      
      // Try to inject the content script first
      chrome.runtime.sendMessage(
        { action: 'injectContentScript' },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error injecting content script:', chrome.runtime.lastError);
            updateStatus('Error: ' + chrome.runtime.lastError.message, true);
            return;
          }
          
          if (response && response.success) {
            // Content script injected successfully, proceed with callback
            callback(tabs[0]);
          } else {
            // Injection failed
            const errorMsg = response && response.message ? response.message : 'Failed to prepare export';
            updateStatus('Error: ' + errorMsg, true);
          }
        }
      );
    });
  }
  
  // Check format selection
  function validateFormatSelection() {
    const markdownChecked = document.getElementById('markdown').checked;
    const htmlChecked = document.getElementById('html').checked;
    
    if (!markdownChecked && !htmlChecked) {
      updateStatus('Please select at least one export format', true);
      return false;
    }
    return true;
  }
  
  // Export current conversation
  exportCurrentButton.addEventListener('click', function() {
    if (!validateFormatSelection()) return;
    
    const markdownChecked = document.getElementById('markdown').checked;
    const htmlChecked = document.getElementById('html').checked;
    
    updateStatus('Preparing to export...');
    
    ensureContentScriptInjected(function(tab) {
      updateStatus('Exporting current conversation...');
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'exportCurrent',
        formats: {
          markdown: markdownChecked,
          html: htmlChecked
        }
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Message sending error:', chrome.runtime.lastError);
          updateStatus('Error: ' + chrome.runtime.lastError.message, true);
          return;
        }
        
        if (response && response.success) {
          const formatList = [];
          if (markdownChecked) formatList.push('Markdown');
          if (htmlChecked) formatList.push('HTML');
          const formatText = formatList.join(' and ');
          
          showSuccess(`Successfully exported ${response.messageCount} messages as ${formatText}`);
        } else {
          const errorMsg = response && response.error ? response.error : 'Could not export conversation';
          updateStatus('Error: ' + errorMsg, true);
        }
      });
    });
  });
  
  // Export all conversations - Coming Soon notification
  exportAllButton.addEventListener('click', function() {
    // Show coming soon message rather than attempting to run the feature
    updateStatus('This feature is coming in a future update!');
    
    // Uncomment below code when "Export All" is implemented
    /*
    if (!validateFormatSelection()) return;
    
    const markdownChecked = document.getElementById('markdown').checked;
    const htmlChecked = document.getElementById('html').checked;
    
    updateStatus('Preparing to export...');
    
    ensureContentScriptInjected(function(tab) {
      updateStatus('Starting export of all conversations...');
      
      chrome.tabs.sendMessage(tab.id, {
        action: 'exportAll',
        formats: {
          markdown: markdownChecked,
          html: htmlChecked
        }
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Message sending error:', chrome.runtime.lastError);
          updateStatus('Error: ' + chrome.runtime.lastError.message, true);
          return;
        }
        
        if (response && response.success) {
          if (response.message) {
            updateStatus(response.message);
          } else {
            showSuccess(`Exported ${response.conversationCount} conversations`);
          }
        } else {
          const errorMsg = response && response.error ? response.error : 'Could not export conversations';
          updateStatus('Error: ' + errorMsg, true);
        }
      });
    });
    */
  });
  
  // Add animation for buttons
  document.querySelectorAll('button').forEach(button => {
    button.addEventListener('mousedown', () => button.classList.add('active'));
    button.addEventListener('mouseup', () => button.classList.remove('active'));
    button.addEventListener('mouseleave', () => button.classList.remove('active'));
  });
});