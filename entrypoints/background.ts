import type { Runtime } from 'wxt/browser';

type PendingPrompt = {
  prompt: string;
  sourceUrl: string;
  createdAt: number;
  injected: boolean;
};

type OpenChatGptMessage = {
  type: 'OPEN_CHATGPT_WITH_THREAD';
  payload: string;
};

type OpenExistingChatMessage = {
  type: 'OPEN_EXISTING_CHAT';
  chatUrl: string;
};

type ChatGptPageReadyMessage = {
  type: 'CHATGPT_PAGE_READY';
  chatUrl: string;
};

type ChatGptPromptSubmittedMessage = {
  type: 'CHATGPT_PROMPT_SUBMITTED';
  chatUrl: string;
  sourceUrl?: string;
  prompt?: string;
  createdAt?: number;
};

type BackgroundMessage =
  | OpenChatGptMessage
  | OpenExistingChatMessage
  | ChatGptPageReadyMessage
  | ChatGptPromptSubmittedMessage;

type ThreadHistoryEntry = {
  chatUrl: string;
  lastUpdated: number;
};

type SessionRecord = {
  hash: string;
  sourceUrl: string;
  chatUrl: string;
  createdAt: number;
  lastUpdated: number;
  prompt: string;
};

const THREAD_HISTORY_STORAGE_KEY = 'redditSummarizerThreadChats';
const SESSION_STORAGE_KEY = 'redditSummarizerSessions';
const THREAD_URL_REGEX =
  /^https?:\/\/(?:old\.|www\.)?reddit\.com\/r\/[^/]+\/comments\/[^/]+(?:\/[^/?#]+)?/i;

const textEncoder = new TextEncoder();

function normalizeThreadUrl(url: string) {
  const match = url.match(THREAD_URL_REGEX);
  if (!match) return null;
  return match[0].replace(/\/+$/, '');
}

function normalizeChatUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return 'https://chatgpt.com';
  }
}

async function createSessionHash(sourceUrl: string, chatUrl: string, createdAt: number) {
  const payload = `${sourceUrl}|${chatUrl}|${createdAt}`;
  const buffer = textEncoder.encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function persistSessionEntry(pending: PendingPrompt, chatUrl: string) {
  try {
    const sessionHash = await createSessionHash(pending.sourceUrl, chatUrl, pending.createdAt);
    const nextEntry: SessionRecord = {
      hash: sessionHash,
      sourceUrl: pending.sourceUrl,
      chatUrl,
      createdAt: pending.createdAt,
      lastUpdated: Date.now(),
      prompt: pending.prompt,
    };

    const stored = (await browser.storage.local.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY] as
      | Record<string, SessionRecord>
      | undefined;

    const nextSessions = {
      ...(stored ?? {}),
      [sessionHash]: nextEntry,
    };

    await browser.storage.local.set({ [SESSION_STORAGE_KEY]: nextSessions });
    console.info('[Reddit Summarizer] tracked session', {
      hash: sessionHash,
      sourceUrl: pending.sourceUrl,
      chatUrl,
      prompt: pending.prompt,
    });
  } catch (error) {
    console.warn('Failed to persist session history', error);
  }
}

async function recordThreadHistory(pending: PendingPrompt, chatUrl: string) {
  await Promise.resolve(()=> setTimeout(() => {}, 5000)); 
  await persistSessionEntry(pending, chatUrl);

  const threadKey = normalizeThreadUrl(pending.sourceUrl);
  if (!threadKey) return;

  try {
    const stored = (await browser.storage.local.get(THREAD_HISTORY_STORAGE_KEY))[
      THREAD_HISTORY_STORAGE_KEY
    ] as Record<string, ThreadHistoryEntry> | undefined;

    const nextHistory = {
      ...(stored ?? {}),
      [threadKey]: {
        chatUrl,
        lastUpdated: Date.now(),
      },
    };

    await browser.storage.local.set({ [THREAD_HISTORY_STORAGE_KEY]: nextHistory });
    console.info('[Reddit Summarizer] updated thread history', { threadKey, chatUrl });
  } catch (error) {
    console.warn('Failed to persist thread history', error);
  }
}

const pendingPrompts = new Map<number, PendingPrompt>();

function isBackgroundMessage(message: unknown): message is BackgroundMessage {
  if (typeof message !== 'object' || message == null || !('type' in message)) {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    payload?: unknown;
    chatUrl?: unknown;
    sourceUrl?: unknown;
    prompt?: unknown;
    createdAt?: unknown;
  };
  if (candidate.type === 'OPEN_CHATGPT_WITH_THREAD') {
    return typeof candidate.payload === 'string';
  }

  if (candidate.type === 'OPEN_EXISTING_CHAT') {
    return typeof candidate.chatUrl === 'string';
  }

  if (candidate.type === 'CHATGPT_PAGE_READY') {
    return typeof candidate.chatUrl === 'string';
  }

  if (candidate.type === 'CHATGPT_PROMPT_SUBMITTED') {
    if (typeof candidate.chatUrl !== 'string') return false;

    const hasFallbackPayload =
      typeof candidate.sourceUrl === 'string' &&
      typeof candidate.prompt === 'string' &&
      (candidate.createdAt == null || typeof candidate.createdAt === 'number');

    return hasFallbackPayload || true;
  }

  return false;
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
        pendingPrompts.set(tab.id, {
          prompt,
          sourceUrl,
          createdAt: Date.now(),
          injected: false,
        });
      }

      return { ok: true };
    }

    if (message.type === 'OPEN_EXISTING_CHAT') {
      const targetUrl = normalizeChatUrl(message.chatUrl);
      await browser.tabs.create({ url: targetUrl });
      return { ok: true };
    }

    if (message.type === 'CHATGPT_PAGE_READY' && sender.tab?.id != null) {
      const pending = pendingPrompts.get(sender.tab.id);
      if (!pending) return { ok: false };
      if (pending.injected) return { ok: true };

      await browser.tabs.sendMessage(sender.tab.id, {
        type: 'INJECT_CHATGPT_PROMPT',
        payload: pending.prompt,
      });

      pending.injected = true;
      return { ok: true };
    }

    if (message.type === 'CHATGPT_PROMPT_SUBMITTED' && sender.tab?.id != null) {
      const pendingFromMap = pendingPrompts.get(sender.tab.id);
      const pendingFromFallback =
        typeof message.sourceUrl === 'string' && typeof message.prompt === 'string'
          ? {
              sourceUrl: message.sourceUrl,
              prompt: message.prompt,
              createdAt: typeof message.createdAt === 'number' ? message.createdAt : Date.now(),
              injected: true,
            }
          : null;

      const pending = pendingFromMap ?? pendingFromFallback;
      if (!pending) return { ok: false };

      const chatUrl = normalizeChatUrl(message.chatUrl || sender.tab.url || 'https://chatgpt.com/');
      await recordThreadHistory(pending, chatUrl);
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
