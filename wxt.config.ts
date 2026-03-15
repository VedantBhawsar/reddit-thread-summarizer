import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: 'Reddit Summarizer',
    description: 'Capture the visible Reddit thread and send it to ChatGPT.',
    permissions: ['tabs', 'activeTab', 'scripting'],
    host_permissions: [
      '*://*.reddit.com/*',
      '*://chat.openai.com/*',
      '*://chatgpt.com/*',
    ],
    action: {
      default_title: 'Reddit Summarizer',
    },
  },
});
