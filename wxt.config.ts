import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: 'Reddit Summarizer',
    description:
      'Inject a floating control on Reddit threads, summarize visible content, and reopen the matching ChatGPT conversation.',
    permissions: ['tabs', 'activeTab', 'scripting', 'storage'],
    host_permissions: [
      '*://*.reddit.com/*',
      '*://chat.openai.com/*',
      '*://chatgpt.com/*',
    ],
    icons: {
      16: 'logo.png',
      48: 'logo.png',
      128: 'logo.png',
    },
    action: {
      default_title: 'Reddit Summarizer',
      default_icon: {
        16: 'logo.png',
        48: 'logo.png',
        128: 'logo.png',
      },
    },
  },
});
