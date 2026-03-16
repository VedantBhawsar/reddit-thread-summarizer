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
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'Reddit Summarizer',
      default_icon: {
        16: 'icons/icon-16.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'reddit-summarizer@vedant.dev',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
