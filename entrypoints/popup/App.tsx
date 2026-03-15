import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import logo from '../../logo.png';

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
const openSessionChat = (chatUrl: string) => {
  if (!chatUrl) return;
  void browser.tabs.create({ url: chatUrl });
};
const createKeyDownHandler =
  (chatUrl: string) => (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSessionChat(chatUrl);
    }
  };

export default function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    let active = true;
    const storage = browser.storage;

    if (!storage?.local) {
      console.warn('[Reddit Summarizer] storage API unavailable');
      return () => {
        active = false;
      };
    }

    const loadSessions = async () => {
      try {
        const stored = (await storage.local.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY] as
          | Record<string, SessionRecord>
          | undefined;
        if (!active) return;
        setSessions(stored ? Object.values(stored) : []);
        console.info('[Reddit Summarizer] popup loaded sessions', {
          count: stored ? Object.keys(stored).length : 0,
        });
      } catch (error) {
        console.error('Failed to load session history', error);
      }
    };

    loadSessions();

    const handleStorageChange: StorageChangeListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (!(SESSION_STORAGE_KEY in changes)) return;
      const updated = changes[SESSION_STORAGE_KEY].newValue as
        | Record<string, SessionRecord>
        | undefined;
      setSessions(updated ? Object.values(updated) : []);
      console.info('[Reddit Summarizer] popup storage mutated', {
        count: updated ? Object.keys(updated).length : 0,
      });
    };

    storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.lastUpdated - a.lastUpdated),
    [sessions],
  );
  const totalSessions = sessions.length;
  const latestSession = sortedSessions[0];
  const recentSessions = sortedSessions.slice(0, 3);
  const latestTimestamp = latestSession ? formatTimestamp(latestSession.lastUpdated) : '—';

  const sessionCards = [
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

  return (
    <main className="popup-shell">
      <div className="hero">
        <img src={logo} alt="Reddit Summarizer mark" className="hero-logo" />
        <div>
          <p className="eyebrow">WXT + React</p>
          <h1>Reddit Summarizer</h1>
          <p className="lede">
            Capture any Reddit thread, forward it to ChatGPT, and see the summary land without leaving
            the page.
          </p>
        </div>
      </div>

      <section className="session">
        <header>
          <h2>Session overview</h2>
          <p>Hash-based tracking keeps every capture tied to its Reddit thread plus ChatGPT chat URL.</p>
        </header>
        <div className="session-grid">
          {sessionCards.map(({ label, value, detail }) => (
            <article key={label} className="session-card">
              <p className="session-label">{label}</p>
              <p className="session-value">{value}</p>
              <p className="session-detail">{detail}</p>
            </article>
          ))}
        </div>

        <div className="session-log">
          <div className="session-log-header">
            <h3>Recent session hashes</h3>
            <p>Each row captures the hashed key, timestamp, and destination chat for a session.</p>
          </div>
          {recentSessions.length ? (
            <ul>
              {recentSessions.map((session) => (
                <li
                  key={session.hash}
                  className="session-log-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openSessionChat(session.chatUrl)}
                  onKeyDown={createKeyDownHandler(session.chatUrl)}
                  aria-label={`Open ChatGPT session for ${session.sourceUrl}`}
                >
                  <div className="session-log-meta">
                    <span>{truncateHash(session.hash)}</span>
                    <span>{formatTimestamp(session.createdAt)}</span>
                  </div>
                  <p className="session-log-link">{session.chatUrl}</p>
                  <p className="session-log-source">{session.sourceUrl}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="session-empty">No sessions recorded yet. Capture a thread to populate this log.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>How it works</h2>
        <ol>
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="panel panel-accent">
        <h2>Known limits</h2>
        <p>Only comments currently rendered in Reddit&apos;s DOM are captured.</p>
        <p>ChatGPT automation can drift over time, so the selectors may require maintenance.</p>
      </section>
    </main>
  );
}
