chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((message) => {
    if(message.act === 'thumbnail') {
      chrome.tabs.create({url: message.url}, (tab) => {
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, changeTab) => {
          if(tabId !== tab.id || changeInfo.status !== 'complete') {
            return false
          }

          chrome.tabs.captureVisibleTab(null, {format: 'png', quality: 100}, (data) => {
            port.postMessage({url: message.url, title: changeTab.title, favicon: changeTab.favIconUrl, thumbnail: data})
            chrome.tabs.remove(tab.id)
          })
        })
      })
    }
  })
})
