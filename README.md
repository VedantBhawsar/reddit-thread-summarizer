# Reddit Thread Summarizer

A browser extension to quickly summarize Reddit threads using ChatGPT. Built with [wxt](https://wxt.dev/), React, and Vite-style development for rapid, modern extension workflows.

## Features

- Adds a floating summarizer button to every Reddit thread.
- Captures the main post and all currently-rendered comments.
- Opens ChatGPT in a new tab and auto-inserts a summarization prompt.
- Automatically attempts to submit the prompt for summarization.

## Installation & Development

Clone the repository and install dependencies:

```bash
npm install
```

To start development mode:

```bash
npm run dev
```

### Build for Distribution

For a production (zip) build:

```bash
npm run build
npm run zip
```

### Firefox Build

To target Firefox specifically:

```bash
npm run dev:firefox
npm run build:firefox
npm run zip:firefox
```

## Notes

- Only comments currently loaded in Reddit's DOM are summarized.
- The automation for ChatGPT may break if their site changes and could require updates to selectors.
- This extension is designed for personal use and prototyping, not guaranteed for production reliability.

## Technologies Used

- **TypeScript** (91.1%)
- **CSS** (7.2%)
- **JavaScript** (1.1%)
- **HTML** (0.6%)

## Contributing

Pull requests, bug reports and suggestions are welcome! Please open an issue for discussion before making large changes.

---

MIT License