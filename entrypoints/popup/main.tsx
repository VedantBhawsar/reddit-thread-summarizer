import { browser } from 'wxt/browser';
import logo from '../../logo.png';
import './style.css';

type BrowserModule = typeof import('wxt/browser')['browser'];
type StorageChangeListener = Parameters<
  BrowserModule['storage']['onChanged']['addListener']
>[0];

type SessionRecord = {
  hash: string;
  sourceUrl: string;
  chatUrl: string;
  prompt: string;
  createdAt: number;
  lastUpdated: number;
};

const SESSION_STORAGE_KEY = 'redditSummarizerSessions';
const STEPS = [
  'Open a Reddit thread and scroll until the comments you care about become visible.',
  'Click “Send Thread to ChatGPT” to capture the current viewport.',
  'The extension opens ChatGPT, injects the prompt, and begins summarizing automatically.',
];

const formatTimestamp = (value: number) => new Date(value).toLocaleString();
const truncateHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-4)}`;

function openSessionChat(chatUrl: string) {
  if (!chatUrl) return;
  void browser.tabs.create({ url: chatUrl });
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function buildPopupShell() {
  const shell = createElement('main', 'popup-shell');

  const hero = createElement('div', 'hero');
  const heroLogo = createElement('img', 'hero-logo') as HTMLImageElement;
  heroLogo.src = logo;
  heroLogo.alt = 'Reddit Summarizer mark';
  const heroBody = createElement('div');
  heroBody.append(
    createElement('h1', undefined, 'Reddit Summarizer'),
    createElement(
      'p',
      'lede',
      'Capture any Reddit thread, forward it to ChatGPT, and see the summary land without leaving the page.',
    ),
  );
  hero.append(heroLogo, heroBody);

  const sessionSection = createElement('section', 'session');
  const sessionHeader = createElement('header');
  sessionHeader.append(
    createElement('h2', undefined, 'Session overview'),
    createElement(
      'p',
      undefined,
      'Hash-based tracking keeps every capture tied to its Reddit thread plus ChatGPT chat URL.',
    ),
  );

  const cardsGrid = createElement('div', 'session-grid');
  const sessionLog = createElement('div', 'session-log');
  const sessionLogHeader = createElement('div', 'session-log-header');
  sessionLogHeader.append(
    createElement('h3', undefined, 'Recent session hashes'),
    createElement(
      'p',
      undefined,
      'Each row captures the hashed key, timestamp, and destination chat for a session.',
    ),
  );
  const sessionLogBody = createElement('div');
  sessionLog.append(sessionLogHeader, sessionLogBody);

  sessionSection.append(sessionHeader, cardsGrid, sessionLog);

  const stepsPanel = createElement('section', 'panel');
  stepsPanel.append(createElement('h2', undefined, 'How it works'));
  const stepsList = createElement('ol');
  for (const step of STEPS) {
    stepsList.append(createElement('li', undefined, step));
  }
  stepsPanel.append(stepsList);

  const limitsPanel = createElement('section', 'panel panel-accent');
  limitsPanel.append(
    createElement('h2', undefined, 'Known limits'),
    createElement('p', undefined, "Only comments currently rendered in Reddit's DOM are captured."),
    createElement(
      'p',
      undefined,
      'ChatGPT automation can drift over time, so the selectors may require maintenance.',
    ),
  );

  shell.append(hero, sessionSection, stepsPanel, limitsPanel);

  const renderSessions = (sessions: SessionRecord[]) => {
    const sortedSessions = [...sessions].sort((a, b) => b.lastUpdated - a.lastUpdated);
    const totalSessions = sessions.length;
    const latestSession = sortedSessions[0];
    const recentSessions = sortedSessions.slice(0, 3);
    const latestTimestamp = latestSession ? formatTimestamp(latestSession.lastUpdated) : '—';

    const cards = [
      {
        label: 'Session status',
        value: totalSessions ? 'Tracking active' : 'Ready',
        detail: totalSessions
          ? `Last capture ${latestTimestamp}`
          : 'Open a Reddit thread to start your first session.',
      },
      {
        label: 'Saved sessions',
        value: `${totalSessions}`,
        detail: totalSessions
          ? 'Unique hashes are stored for each capture.'
          : 'No session history stored yet.',
      },
      {
        label: 'Latest chat URL',
        value: latestSession?.chatUrl ?? '—',
        detail: latestSession
          ? `Hash ${truncateHash(latestSession.hash)}`
          : 'Chat URL will appear here after the first capture.',
      },
    ];

    cardsGrid.textContent = '';
    for (const card of cards) {
      const cardNode = createElement('article', 'session-card');
      cardNode.append(
        createElement('p', 'session-label', card.label),
        createElement('p', 'session-value', card.value),
        createElement('p', 'session-detail', card.detail),
      );
      cardsGrid.append(cardNode);
    }

    sessionLogBody.textContent = '';
    if (!recentSessions.length) {
      sessionLogBody.append(
        createElement('p', 'session-empty', 'No sessions recorded yet. Capture a thread to populate this log.'),
      );
      return;
    }

    const list = createElement('ul');
    for (const session of recentSessions) {
      const item = createElement('li', 'session-log-row');
      item.role = 'button';
      item.tabIndex = 0;
      item.setAttribute('aria-label', `Open ChatGPT session for ${session.sourceUrl}`);
      item.addEventListener('click', () => openSessionChat(session.chatUrl));
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openSessionChat(session.chatUrl);
        }
      });

      const meta = createElement('div', 'session-log-meta');
      meta.append(
        createElement('span', undefined, truncateHash(session.hash)),
        createElement('span', undefined, formatTimestamp(session.createdAt)),
      );

      item.append(
        meta,
        createElement('p', 'session-log-link', session.chatUrl),
        createElement('p', 'session-log-source', session.sourceUrl),
      );
      list.append(item);
    }
    sessionLogBody.append(list);
  };

  return { shell, renderSessions };
}

async function readSessions() {
  const stored = (await browser.storage.local.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY] as
    | Record<string, SessionRecord>
    | undefined;
  return stored ? Object.values(stored) : [];
}

const root = document.getElementById('root');
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing root element for popup');
}

const { shell, renderSessions } = buildPopupShell();
root.replaceChildren(shell);

const loadSessions = async () => {
  try {
    const sessions = await readSessions();
    renderSessions(sessions);
  } catch (error) {
    console.error('Failed to load session history', error);
    renderSessions([]);
  }
};

void loadSessions();

const handleStorageChange: StorageChangeListener = (changes, areaName) => {
  if (areaName !== 'local') return;
  if (!(SESSION_STORAGE_KEY in changes)) return;

  const updated = changes[SESSION_STORAGE_KEY].newValue as Record<string, SessionRecord> | undefined;
  renderSessions(updated ? Object.values(updated) : []);
};

browser.storage.onChanged.addListener(handleStorageChange);
window.addEventListener('unload', () => {
  browser.storage.onChanged.removeListener(handleStorageChange);
});
