const BUTTON_ID = 'reddit-summarizer-button';

const THREAD_URL_REGEX =
  /^https?:\/\/(?:old\.|www\.)?reddit\.com\/r\/[^/]+\/comments\/[^/]+(?:\/[^/?#]+)?/i;

const COMMENT_TREE_SELECTORS = [
  'shreddit-comment-tree',
  '[data-testid="comments-page"]',
  '[data-testid="post-comment-listing"]',
  '#comment-tree',
].join(', ');

const COMMENT_SELECTORS = [
  'shreddit-comment',
  '[data-testid="comment"]',
  '[data-testid*="comment"]',
  '[thingid^="t1_"]',
  '.Comment',
  '.comment',
].join(', ');

const COMMENT_BODY_SELECTORS = [
  '[slot="comment"]',
  '[data-testid="comment-content"]',
  '[data-adclicklocation="media"] + div div[data-testid]',
  '.md',
  '[role="document"]',
].join(', ');

const COMMENT_META_SELECTORS = [
  'faceplate-author-link',
  'a[data-testid="comment_author_link"]',
  'a[href*="/user/"]',
  'a[href*="/u/"]',
].join(', ');

const HISTORY_STORAGE_KEY = 'redditSummarizerThreadChats';

type BrowserModule = typeof import('wxt/browser')['browser'];
type StorageOnChangedListener = Parameters<
  BrowserModule['storage']['onChanged']['addListener']
>[0];

type ThreadHistoryEntry = {
  chatUrl: string;
  lastUpdated: number;
};

type FloatingWidget = {
  container: HTMLDivElement;
  historyPanel: HTMLDivElement;
  historyToggle: HTMLButtonElement;
  entryButton: HTMLButtonElement;
  entryTitle: HTMLSpanElement;
  entryMeta: HTMLSpanElement;
  summaryButton: HTMLButtonElement;
  setPanelOpen: (open: boolean) => void;
  dispose: () => void;
};

function normalizeText(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

function getVisibleText(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) return '';
  return normalizeText(element.innerText || element.textContent || '');
}

function normalizeThreadUrl(url: string) {
  const match = url.match(THREAD_URL_REGEX);
  if (!match) return null;
  return match[0].replace(/\/+$/, '');
}

function formatSavedLabel(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Saved recently';

  const formatted = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Saved ${formatted}`;
}

async function readThreadHistory(threadKey: string) {
  try {
    const stored = (await browser.storage.local.get(HISTORY_STORAGE_KEY))[
      HISTORY_STORAGE_KEY
    ] as Record<string, ThreadHistoryEntry> | undefined;
    if (!stored) return null;
    return stored[threadKey] ?? null;
  } catch (error) {
    console.warn('Failed to read thread history', error);
    return null;
  }
}

async function openSavedChat(chatUrl: string) {
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'OPEN_EXISTING_CHAT',
      chatUrl,
    })) as { ok?: boolean } | undefined;

    if (response?.ok) return;
  } catch (error) {
    console.warn('Failed to open saved chat from background', error);
  }

  window.open(chatUrl, '_blank', 'noopener,noreferrer');
}

function isLikelyNestedComment(node: HTMLElement, allNodes: HTMLElement[]) {
  return allNodes.some((other) => other !== node && other.contains(node));
}

function extractPostBody() {
  const candidates = [
    '[data-test-id="post-content"]',
    '[data-click-id="text"]',
    '[slot="text-body"]',
    'shreddit-post',
  ];

  for (const selector of candidates) {
    const element = document.querySelector<HTMLElement>(selector);
    const text = element?.innerText?.trim();
    if (text) return text;
  }

  return '';
}

function extractCommentBody(node: HTMLElement) {
  const directBody = node.querySelector(COMMENT_BODY_SELECTORS);
  if (directBody) {
    const text = getVisibleText(directBody);
    if (text) return text;
  }

  if (node.tagName.toLowerCase() === 'shreddit-comment') {
    const slotBody = Array.from(node.children).find((child) => {
      if (!(child instanceof HTMLElement)) return false;
      const slot = child.getAttribute('slot');
      return slot === 'comment' || slot === 'main';
    });

    const text = getVisibleText(slotBody);
    if (text) return text;
  }

  const paragraphs = Array.from(node.querySelectorAll('p'))
    .map((paragraph) => getVisibleText(paragraph))
    .filter(Boolean);

  if (paragraphs.length) return paragraphs.join('\n\n');

  return getVisibleText(node);
}

function extractCommentAuthor(node: HTMLElement) {
  const author = node.querySelector(COMMENT_META_SELECTORS);
  return getVisibleText(author);
}

function extractComments() {
  const commentRoot =
    document.querySelector<HTMLElement>(COMMENT_TREE_SELECTORS) ?? document.body;
  const allNodes = Array.from(commentRoot.querySelectorAll<HTMLElement>(COMMENT_SELECTORS));
  const nodes = allNodes.filter((node) => !isLikelyNestedComment(node, allNodes));

  const seen = new Set<string>();

  return nodes
    .map((node) => {
      const body = extractCommentBody(node);
      if (!body) return '';

      const author = extractCommentAuthor(node);
      const entry = author ? `${author}:\n${body}` : body;
      const normalizedEntry = normalizeText(entry);

      if (!normalizedEntry || seen.has(normalizedEntry)) return '';
      seen.add(normalizedEntry);
      return normalizedEntry;
    })
    .filter(Boolean);
}

let floatingWidget: FloatingWidget | null = null;
let currentThreadKey: string | null = null;
let currentHistoryEntry: ThreadHistoryEntry | null = null;

function buildActionButton() {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.setAttribute('aria-label', 'Send the visible Reddit thread to ChatGPT for summarization');
  button.style.zIndex = '1';
  button.style.padding = '10px 18px';
  button.style.borderRadius = '8px';
  button.style.border = 'none';
  button.style.background = '#ff4500';
  button.style.color = '#ffffff';
  button.style.fontSize = '13px';
  button.style.fontWeight = '600';
  button.style.textTransform = 'capitalize';
  button.style.letterSpacing = '0.02em';
  button.style.boxShadow = '0 2px 8px rgba(255, 69, 0, 0.3)';
  button.style.cursor = 'pointer';
  button.style.fontFamily = 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, sans-serif';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.gap = '8px';
  button.style.transition = 'all 200ms ease';
  button.style.opacity = '0.95';

  const icon = document.createElement('span');
  icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
  icon.style.display = 'flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';

  const label = document.createElement('span');
  label.dataset.role = 'label';
  label.textContent = 'Summarize';
  label.style.display = 'inline-flex';
  label.style.alignItems = 'center';
  label.style.whiteSpace = 'nowrap';

  button.append(icon, label);

  button.addEventListener('mouseenter', () => {
    button.style.background = '#ff5722';
    button.style.boxShadow = '0 4px 16px rgba(255, 69, 0, 0.4)';
    button.style.transform = 'translateY(-1px)';
    button.style.opacity = '1';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = '#ff4500';
    button.style.boxShadow = '0 2px 8px rgba(255, 69, 0, 0.3)';
    button.style.transform = 'translateY(0)';
    button.style.opacity = '0.95';
  });

  button.addEventListener('click', () => void sendThreadToChatGPT(button));
  return button;
}

function createFloatingWidget(): FloatingWidget {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.right = '16px';
  container.style.bottom = '16px';
  container.style.zIndex = '2147483647';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'flex-end';
  container.style.gap = '10px';
  container.style.width = 'fit-content';
  container.style.fontFamily = 'IBM Plex Sans, -apple-system, BlinkMacSystemFont, sans-serif';
  container.style.pointerEvents = 'auto';

  const historyPanel = document.createElement('div');
  historyPanel.style.display = 'none';
  historyPanel.style.width = '292px';
  historyPanel.style.maxWidth = 'calc(100vw - 24px)';
  historyPanel.style.flexDirection = 'column';
  historyPanel.style.background = 'rgba(20, 22, 26, 0.94)';
  historyPanel.style.backdropFilter = 'blur(18px)';
  historyPanel.style.borderRadius = '16px';
  historyPanel.style.padding = '14px';
  historyPanel.style.boxShadow = '0 14px 36px rgba(0, 0, 0, 0.45)';
  historyPanel.style.border = '1px solid rgba(255, 255, 255, 0.12)';
  historyPanel.style.color = '#f7f5f1';
  historyPanel.style.gap = '12px';
  historyPanel.style.opacity = '0';
  historyPanel.style.transform = 'translateY(6px) scaleY(0.98)';
  historyPanel.style.transformOrigin = 'bottom right';
  historyPanel.style.transition = 'opacity 180ms ease, transform 180ms ease';
  historyPanel.style.pointerEvents = 'none';
  historyPanel.style.visibility = 'hidden';
  historyPanel.style.zIndex = '2';

  const historyDescription = document.createElement('p');
  historyDescription.textContent = 'You already opened a chat for this thread.';
  historyDescription.style.margin = '0';
  historyDescription.style.fontSize = '12px';
  historyDescription.style.lineHeight = '1.35';
  historyDescription.style.opacity = '0.8';
  historyDescription.style.color = '#f1f0ec';

  const entryButton = document.createElement('button');
  entryButton.type = 'button';
  entryButton.style.width = '100%';
  entryButton.style.border = '1px solid rgba(255, 255, 255, 0.12)';
  entryButton.style.borderRadius = '12px';
  entryButton.style.padding = '10px 12px';
  entryButton.style.display = 'flex';
  entryButton.style.flexDirection = 'column';
  entryButton.style.alignItems = 'flex-start';
  entryButton.style.justifyContent = 'center';
  entryButton.style.gap = '5px';
  entryButton.style.background = 'linear-gradient(180deg, rgba(54, 58, 66, 0.9), rgba(36, 39, 45, 0.9))';
  entryButton.style.color = '#ffffff';
  entryButton.style.fontFamily = 'inherit';
  entryButton.style.fontSize = '13px';
  entryButton.style.cursor = 'not-allowed';
  entryButton.style.opacity = '0.6';
  entryButton.style.textAlign = 'left';
  entryButton.style.transition = 'transform 180ms ease, box-shadow 180ms ease';
  entryButton.style.boxShadow = 'none';
  entryButton.disabled = true;
  entryButton.setAttribute('aria-label', 'Continue previous conversation');
  entryButton.setAttribute('aria-disabled', 'true');

  const entryTitle = document.createElement('span');
  entryTitle.textContent = 'No saved chat yet';
  entryTitle.style.fontWeight = '600';

  const entryMeta = document.createElement('span');
  entryMeta.textContent = 'Create a summary to save a chat.';
  entryMeta.style.fontSize = '11px';
  entryMeta.style.opacity = '0.75';
  entryMeta.style.maxWidth = '100%';
  entryMeta.style.whiteSpace = 'nowrap';
  entryMeta.style.overflow = 'hidden';
  entryMeta.style.textOverflow = 'ellipsis';

  entryButton.append(entryTitle, entryMeta);
  historyPanel.append(historyDescription, entryButton);

  const buttonGroup = document.createElement('div');
  buttonGroup.style.display = 'inline-flex';
  buttonGroup.style.alignItems = 'stretch';
  buttonGroup.style.gap = '0';
  buttonGroup.style.position = 'relative';
  buttonGroup.style.zIndex = '1';
  buttonGroup.style.pointerEvents = 'auto';

  const summaryButton = buildActionButton();
  summaryButton.style.margin = '0';
  summaryButton.style.padding = '10px 16px';
  summaryButton.style.borderRadius = '10px';

  const historyToggle = document.createElement('button');
  historyToggle.type = 'button';
  historyToggle.style.width = '36px';
  historyToggle.style.height = '36px';
  historyToggle.style.padding = '0';
  historyToggle.style.borderRadius = '0 10px 10px 0';
  historyToggle.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  historyToggle.style.borderLeft = 'none';
  historyToggle.style.background = '#1f1f1f';
  historyToggle.style.color = '#ffffff';
  historyToggle.style.display = 'flex';
  historyToggle.style.alignItems = 'center';
  historyToggle.style.justifyContent = 'center';
  historyToggle.style.fontSize = '16px';
  historyToggle.style.cursor = 'pointer';
  historyToggle.style.transition = 'transform 200ms ease, background 120ms ease';
  historyToggle.innerHTML = '<span aria-hidden=\"true\">▴</span>';
  historyToggle.title = 'Show previous conversation';
  historyToggle.setAttribute('aria-expanded', 'false');
  historyToggle.hidden = true;
  historyToggle.style.display = 'none';
  historyToggle.addEventListener('mouseenter', () => (historyToggle.style.background = '#2d2d2d'));
  historyToggle.addEventListener('mouseleave', () => (historyToggle.style.background = '#1f1f1f'));

  buttonGroup.append(summaryButton, historyToggle);
  container.append(historyPanel, buttonGroup);

  let panelOpen = false;

  const setPanelOpen = (open: boolean) => {
    if (historyPanel.style.display === 'none') {
      panelOpen = false;
      historyToggle.setAttribute('aria-expanded', 'false');
      historyToggle.style.transform = 'rotate(0deg)';
      return;
    }

    panelOpen = open;
    if (open) {
      historyPanel.style.transform = 'translateY(0) scaleY(1)';
      historyPanel.style.opacity = '1';
      historyPanel.style.visibility = 'visible';
      historyPanel.style.pointerEvents = 'auto';
    } else {
      historyPanel.style.transform = 'translateY(6px) scaleY(0.98)';
      historyPanel.style.opacity = '0';
      historyPanel.style.visibility = 'hidden';
      historyPanel.style.pointerEvents = 'none';
    }

    historyToggle.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    historyToggle.setAttribute('aria-expanded', String(open));
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (panelOpen && !container.contains(event.target as Node)) {
      setPanelOpen(false);
    }
  };

  historyToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (historyPanel.style.display === 'none') return;
    setPanelOpen(!panelOpen);
  });

  entryButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const chatUrl = currentHistoryEntry?.chatUrl;
    if (!chatUrl) return;
    void openSavedChat(chatUrl);
    setPanelOpen(false);
  });

  entryButton.addEventListener('mouseenter', () => {
    if (entryButton.disabled) return;
    entryButton.style.transform = 'translateY(-2px)';
    entryButton.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.45)';
  });

  entryButton.addEventListener('mouseleave', () => {
    if (entryButton.disabled) return;
    entryButton.style.transform = 'translateY(0)';
    entryButton.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)';
  });

  document.addEventListener('click', handleDocumentClick);

  const dispose = () => {
    setPanelOpen(false);
    document.removeEventListener('click', handleDocumentClick);
    container.remove();
  };

  return {
    container,
    historyPanel,
    historyToggle,
    entryButton,
    entryTitle,
    entryMeta,
    summaryButton,
    setPanelOpen,
    dispose,
  };
}

async function refreshHistoryState(threadKey: string) {
  const widget = floatingWidget;
  if (!widget) return;

  const entry = await readThreadHistory(threadKey);
  if (!floatingWidget || currentThreadKey !== threadKey) return;

  currentHistoryEntry = entry;

  if (!entry) {
    widget.historyToggle.hidden = true;
    widget.historyToggle.style.display = 'none';
    widget.historyPanel.style.display = 'none';
    widget.historyPanel.style.visibility = 'hidden';
    widget.historyPanel.style.opacity = '0';
    widget.historyPanel.style.pointerEvents = 'none';
    widget.historyPanel.style.transform = 'translateY(6px) scaleY(0.98)';
    widget.setPanelOpen(false);
    widget.entryButton.disabled = true;
    widget.entryButton.setAttribute('disabled', 'true');
    widget.entryButton.style.cursor = 'not-allowed';
    widget.entryButton.style.opacity = '0.6';
    widget.entryButton.style.pointerEvents = 'none';
    widget.entryButton.setAttribute('aria-disabled', 'true');
    widget.entryTitle.textContent = 'No saved chat yet';
    widget.entryMeta.textContent = 'Create a summary to save a chat.';
    widget.summaryButton.style.borderRadius = '10px';
    widget.summaryButton.style.borderRight = 'none';
    widget.entryButton.style.boxShadow = 'none';
    widget.entryButton.style.transform = 'translateY(0)';
    return;
  }

  widget.historyToggle.hidden = false;
  widget.historyToggle.style.display = 'flex';
  widget.historyPanel.style.display = 'flex';
  widget.entryButton.disabled = false;
  widget.entryButton.removeAttribute('disabled');
  widget.entryButton.style.cursor = 'pointer';
  widget.entryButton.style.opacity = '1';
  widget.entryButton.style.pointerEvents = 'auto';
  widget.entryButton.setAttribute('aria-disabled', 'false');
  widget.entryTitle.textContent = 'Continue previous chat';
  widget.entryMeta.textContent = formatSavedLabel(entry.lastUpdated);
  widget.setPanelOpen(false);
  widget.summaryButton.style.borderRadius = '10px 0 0 10px';
  widget.summaryButton.style.borderRight = '1px solid rgba(255, 255, 255, 0.08)';
  widget.entryButton.style.boxShadow = 'none';
}

function updateButtonVisibility() {
  const threadKey = normalizeThreadUrl(window.location.href);
  if (threadKey) {
    if (!floatingWidget) {
      floatingWidget = createFloatingWidget();
      document.body.append(floatingWidget.container);
    }
    if (currentThreadKey !== threadKey) {
      currentThreadKey = threadKey;
      void refreshHistoryState(threadKey);
    }
    return;
  }

  if (floatingWidget) {
    floatingWidget.dispose();
    floatingWidget = null;
  }
  currentThreadKey = null;
  currentHistoryEntry = null;
}

function watchLocationChange(onChange: () => void) {
  let lastUrl = window.location.href;
  let frame = 0;

  const check = () => {
    const current = window.location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      onChange();
    }
    frame = window.requestAnimationFrame(check);
  };

  check();

  return () => {
    window.cancelAnimationFrame(frame);
  };
}

function scrapeVisibleThread() {
  const title = document.querySelector('h1')?.textContent?.trim() ?? '';
  const postBody = extractPostBody();
  const comments = extractComments();

  return [
    `TITLE:\n${title}`,
    `POST:\n${postBody || 'No post body found.'}`,
    `COMMENTS:\n${comments.length ? comments.join('\n\n---\n\n') : 'No visible comments found.'}`,
  ].join('\n\n');
}

async function sendThreadToChatGPT(button: HTMLButtonElement) {
  const label = button.querySelector<HTMLSpanElement>('[data-role="label"]');
  const originalLabel = 'Summarize';
  const setLabel = (value: string) => {
    if (label) {
      label.textContent = value;
      return;
    }
    button.textContent = value;
  };

  setLabel('Sending...');
  button.disabled = true;

  try {
    await browser.runtime.sendMessage({
      type: 'OPEN_CHATGPT_WITH_THREAD',
      payload: scrapeVisibleThread(),
    });

    setLabel('Opened ChatGPT');
  } catch (error) {
    setLabel('Retry send');
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      setLabel(originalLabel);
    }, 2500);
  }
}

export default defineContentScript({
  matches: ['*://*.reddit.com/*'],
  runAt: 'document_idle',
  main() {
    updateButtonVisibility();
    const stop = watchLocationChange(updateButtonVisibility);
    const handleStorageChange: StorageOnChangedListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (!currentThreadKey) return;
      if (HISTORY_STORAGE_KEY in changes) {
        void refreshHistoryState(currentThreadKey);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    window.addEventListener('unload', () => {
      stop();
      browser.storage.onChanged.removeListener(handleStorageChange);
    });
  },
});
