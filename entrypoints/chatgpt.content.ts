type InjectPromptMessage = {
  type: 'INJECT_CHATGPT_PROMPT';
  payload: string;
};

const COMPOSER_SELECTOR = [
  '#prompt-textarea',
  'textarea[data-testid*="prompt"]',
  'textarea[placeholder]',
  'textarea',
  'div[contenteditable="true"][id="prompt-textarea"]',
  'div[contenteditable="true"][data-testid*="composer"]',
  'div[contenteditable="true"][role="textbox"]',
].join(', ');

const SEND_BUTTON_SELECTOR = [
  'button[data-testid="send-button"]',
  'button[aria-label*="Send message"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
].join(', ');

const CHAT_SESSION_PATH_REGEX = /\/c\/[a-z0-9-]+/i;

function isInjectPromptMessage(message: unknown): message is InjectPromptMessage {
  if (typeof message !== 'object' || message == null || !('type' in message)) {
    return false;
  }

  const candidate = message as { type?: unknown; payload?: unknown };
  return candidate.type === 'INJECT_CHATGPT_PROMPT' && typeof candidate.payload === 'string';
}

function findInTree<T extends Element>(root: ParentNode, selector: string): T | null {
  const directMatch = root.querySelector<T>(selector);
  if (directMatch) return directMatch;

  const elements = root.querySelectorAll<HTMLElement>('*');
  for (const element of elements) {
    const shadowRoot = element.shadowRoot;
    if (!shadowRoot) continue;

    const match = findInTree<T>(shadowRoot, selector);
    if (match) return match;
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForElement<T extends Element>(selector: string, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const match = findInTree<T>(document, selector);
    if (match) return match;
    await sleep(150);
  }

  throw new Error(`Timed out waiting for ${selector}`);
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(textarea, value);
  } else {
    textarea.value = value;
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function setContentEditableValue(input: HTMLElement, value: string) {
  input.focus();
  document.execCommand('selectAll', false);
  document.execCommand('insertText', false, value);

  if (!input.textContent?.trim()) {
    input.textContent = value;
  }

  input.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }),
  );
  input.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }),
  );
}

function setPromptValue(input: HTMLElement, value: string) {
  input.focus();

  if (input instanceof HTMLTextAreaElement) {
    setTextareaValue(input, value);
    return;
  }

  if (input.isContentEditable) {
    setContentEditableValue(input, value);
    return;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function isEnabledButton(button: HTMLButtonElement) {
  return !button.disabled && button.getAttribute('aria-disabled') !== 'true';
}

async function waitForEnabledSendButton(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const button = findInTree<HTMLButtonElement>(document, SEND_BUTTON_SELECTOR);
    if (button && isEnabledButton(button)) {
      return button;
    }
    await sleep(200);
  }

  throw new Error('Send button did not become enabled');
}

function getSessionUrlFromLocation() {
  try {
    const parsed = new URL(window.location.href);
    if (!CHAT_SESSION_PATH_REGEX.test(parsed.pathname)) return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

async function waitForSessionUrl(timeoutMs = 20000) {
  const immediate = getSessionUrlFromLocation();
  if (immediate) return immediate;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = getSessionUrlFromLocation();
    if (url) return url;
    await sleep(300);
  }

  return window.location.href;
}

async function injectPrompt(prompt: string) {
  const composer = await waitForElement<HTMLElement>(COMPOSER_SELECTOR, 30000);
  setPromptValue(composer, prompt);

  const sendButton = await waitForEnabledSendButton(15000);
  sendButton.click();

  return waitForSessionUrl(20000);
}

async function notifyReadyUntilAccepted() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'CHATGPT_PAGE_READY',
        chatUrl: window.location.href,
      })) as { ok?: boolean } | undefined;

      if (response?.ok) return;
    } catch {
      // Keep retrying while the background is still initializing this tab.
    }

    await sleep(250);
  }
}

export default defineContentScript({
  matches: ['*://chat.openai.com/*', '*://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isInjectPromptMessage(message)) return;

      return injectPrompt(message.payload)
        .then((chatUrl) =>
          browser.runtime.sendMessage({
            type: 'CHATGPT_PROMPT_SUBMITTED',
            chatUrl,
          }),
        )
        .catch((error) => {
          console.error('Failed to inject ChatGPT prompt', error);
          return browser.runtime.sendMessage({
            type: 'CHATGPT_PROMPT_SUBMITTED',
            chatUrl: window.location.href,
          });
        });
    });

    void notifyReadyUntilAccepted();
  },
});
