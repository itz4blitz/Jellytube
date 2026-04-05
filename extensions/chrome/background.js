const MENU_PAGE = 'jellytube-add-page';
const MENU_LINK = 'jellytube-add-link';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: 'Add page to Jellytube',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: MENU_LINK,
    title: 'Add link to Jellytube',
    contexts: ['link']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const settings = await chrome.storage.sync.get({
    launchUrl: 'http://localhost:3135/'
  });

  const target = info.linkUrl || info.pageUrl || tab?.url;
  const title = tab?.title || '';

  if (!target) {
    return;
  }

  const nextUrl = buildRequestUrl(settings.launchUrl, target, title);
  await chrome.tabs.create({ url: nextUrl });
});

function buildRequestUrl(launchUrl, targetUrl, title) {
  const next = new URL(launchUrl);
  next.searchParams.set('url', targetUrl);
  if (title) {
    next.searchParams.set('title', title);
  }
  return next.toString();
}
