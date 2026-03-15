type InjectPromptMessage = {
  type: 'INJECT_CHATGPT_PROMPT';
  payload: string;
};

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

async function waitForElement<T extends Element>(selector: string, timeoutMs = 30000) {
  const existing = findInTree<T>(document, selector);
  if (existing) return existing;

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const match = findInTree<T>(document, selector);
      if (!match) return;

      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(match);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function setPromptValue(input: HTMLElement, value: string) {
  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    return;
  }

  if (input instanceof HTMLDivElement && input.isContentEditable) {
    input.focus();
    input.textContent = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  }
}

async function injectPrompt(prompt: string) {
  const composer = await waitForElement<HTMLElement>(
    'textarea, div[contenteditable="true"][data-testid*="composer"], div[contenteditable="true"][role="textbox"]',
  );

  setPromptValue(composer, prompt);

  const sendButton = await waitForElement<HTMLButtonElement>(
    'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"]',
  );

  sendButton.click();
}

export default defineContentScript({
  matches: ['*://chat.openai.com/*', '*://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    void browser.runtime.sendMessage({ type: 'CHATGPT_PAGE_READY' }).catch(() => undefined);

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isInjectPromptMessage(message)) return;

      return injectPrompt(message.payload).catch((error) => {
        console.error('Failed to inject ChatGPT prompt', error);
      });
    });
  },
});
