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

function normalizeText(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

function getVisibleText(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) return '';
  return normalizeText(element.innerText || element.textContent || '');
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

let floatingButton: HTMLButtonElement | null = null;

function buildActionButton() {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.setAttribute('aria-label', 'Send the visible Reddit thread to ChatGPT for summarization');
  button.style.position = 'fixed';
  button.style.right = '16px';
  button.style.bottom = '16px';
  button.style.zIndex = '2147483647';
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

function updateButtonVisibility() {
  const shouldShow = THREAD_URL_REGEX.test(window.location.href);
  if (shouldShow) {
    if (!floatingButton) {
      floatingButton = buildActionButton();
      document.body.append(floatingButton);
    }
    return;
  }

  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
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
    console.error('Failed to send thread to ChatGPT', error);
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
    window.addEventListener('unload', stop);
  },
});
