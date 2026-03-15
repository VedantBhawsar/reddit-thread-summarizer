# Reddit Summarizer

This project is a `wxt` browser extension scaffold using React and Vite-style development.

## What it does

- injects a floating button into Reddit threads
- captures the visible post body and rendered comments
- opens ChatGPT in a new tab
- attempts to insert and submit a summarization prompt automatically

## Commands

```bash
npm install
npm run dev
```

Build for distribution:

```bash
npm run build
npm run zip
```

Build a Firefox-targeted package with the browser flag as well:

```bash
npm run dev:firefox
npm run build:firefox
npm run zip:firefox
```

## Notes

- only comments currently loaded in the Reddit DOM are captured
- ChatGPT DOM automation is inherently brittle and may require selector maintenance
