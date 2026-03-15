import type { Runtime } from 'wxt/browser';

type PendingPrompt = {
  prompt: string;
  sourceUrl: string;
};

type OpenChatGptMessage = {
  type: 'OPEN_CHATGPT_WITH_THREAD';
  payload: string;
};

type ChatGptPageReadyMessage = {
  type: 'CHATGPT_PAGE_READY';
};

type BackgroundMessage = OpenChatGptMessage | ChatGptPageReadyMessage;

const pendingPrompts = new Map<number, PendingPrompt>();

function isBackgroundMessage(message: unknown): message is BackgroundMessage {
  if (typeof message !== 'object' || message == null || !('type' in message)) {
    return false;
  }

  const candidate = message as { type?: unknown; payload?: unknown };
  if (candidate.type === 'OPEN_CHATGPT_WITH_THREAD') {
    return typeof candidate.payload === 'string';
  }

  return candidate.type === 'CHATGPT_PAGE_READY';
}

function buildPrompt(thread: string, sourceUrl: string) {
  return [
    'Summarize the Reddit thread below.',
    'Highlight the main question, strongest answers, disagreements, and practical takeaways.',
    `Source URL: ${sourceUrl}`,
    '',
    thread,
  ].join('\n');
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    async (message: unknown, sender: Runtime.MessageSender) => {
    if (!isBackgroundMessage(message)) {
      return undefined;
    }

    if (message.type === 'OPEN_CHATGPT_WITH_THREAD') {
      const sourceUrl = sender.tab?.url ?? 'unknown';
      const prompt = buildPrompt(message.payload, sourceUrl);
      const tab = await browser.tabs.create({ url: 'https://chatgpt.com/' });

      if (tab.id != null) {
        pendingPrompts.set(tab.id, { prompt, sourceUrl });
      }

      return { ok: true };
    }

    if (message.type === 'CHATGPT_PAGE_READY' && sender.tab?.id != null) {
      const pending = pendingPrompts.get(sender.tab.id);
      if (!pending) return { ok: false };

      await browser.tabs.sendMessage(sender.tab.id, {
        type: 'INJECT_CHATGPT_PROMPT',
        payload: pending.prompt,
      });

      pendingPrompts.delete(sender.tab.id);
      return { ok: true };
    }

    return undefined;
    },
  );

  browser.tabs.onRemoved.addListener((tabId: number) => {
    pendingPrompts.delete(tabId);
  });
});
