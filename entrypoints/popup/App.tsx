const steps = [
  'Open a Reddit thread and scroll until the comments you want are visible.',
  'Click the floating "Send Thread to ChatGPT" button on the page.',
  'The extension opens ChatGPT and submits a summary prompt automatically.',
];

export default function App() {
  return (
    <main className="popup-shell">
      <div className="hero">
        <p className="eyebrow">WXT + React</p>
        <h1>Reddit Summarizer</h1>
        <p className="lede">
          This extension captures the visible Reddit post and comments, then forwards them to
          ChatGPT for summarization.
        </p>
      </div>

      <section className="panel">
        <h2>Current Workflow</h2>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="panel panel-accent">
        <h2>Known Limits</h2>
        <p>Only comments currently rendered in Reddit&apos;s DOM are captured.</p>
        <p>ChatGPT selectors can drift over time, so injection logic may need maintenance.</p>
      </section>
    </main>
  );
}
