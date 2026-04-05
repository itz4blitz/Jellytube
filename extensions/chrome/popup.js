const launchUrlInput = document.getElementById('launchUrl');
const siteNameInput = document.getElementById('siteName');
const saveButton = document.getElementById('saveButton');
const addButton = document.getElementById('addButton');
const status = document.getElementById('status');

init().catch((error) => {
  console.error(error);
  status.textContent = error.message || 'Failed to initialize popup';
});

saveButton.addEventListener('click', async () => {
  await chrome.storage.sync.set({
    launchUrl: launchUrlInput.value.trim() || 'http://localhost:3135/',
    siteName: siteNameInput.value.trim() || 'Jellytube'
  });

  updateButtonLabel();
  status.textContent = 'Settings saved.';
});

addButton.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    status.textContent = 'No active tab URL was found.';
    return;
  }

  const launchUrl = launchUrlInput.value.trim() || 'http://localhost:3135/';
  const next = new URL(launchUrl);
  next.searchParams.set('url', tab.url);
  if (tab.title) {
    next.searchParams.set('title', tab.title);
  }

  await chrome.tabs.create({ url: next.toString() });
  window.close();
});

async function init() {
  const settings = await chrome.storage.sync.get({
    launchUrl: 'http://localhost:3135/',
    siteName: 'Jellytube'
  });

  launchUrlInput.value = settings.launchUrl;
  siteNameInput.value = settings.siteName;
  updateButtonLabel();
}

function updateButtonLabel() {
  const siteName = siteNameInput.value.trim() || 'Jellytube';
  addButton.textContent = `Add to ${siteName}`;
}
