import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

const globalStyles = `
  :root {
    --rnk-bg-top: #fff4fb;
    --rnk-bg-bottom: #eff4ff;
    --rnk-ink: #1f1730;
    --rnk-muted: #625875;
    --rnk-card: rgba(255, 255, 255, 0.88);
    --rnk-card-strong: rgba(255, 255, 255, 0.96);
    --rnk-line: rgba(111, 91, 140, 0.14);
    --rnk-accent: #d61f8c;
    --rnk-accent-soft: rgba(214, 31, 140, 0.12);
    --rnk-accent-2: #5b6df8;
    --rnk-success: #0f9b71;
    --rnk-warning: #b66a00;
    --rnk-danger: #c43d47;
    --rnk-shadow: 0 28px 80px rgba(82, 34, 115, 0.12);
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    min-height: 100%;
  }

  body {
    margin: 0;
    color: var(--rnk-ink);
    font-family: Inter, "Hiragino Sans", "Yu Gothic", "Yu Gothic UI", "Noto Sans JP", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.95), transparent 28%),
      linear-gradient(180deg, var(--rnk-bg-top) 0%, #ffffff 36%, var(--rnk-bg-bottom) 100%);
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .rnk-page {
    display: grid;
    gap: 20px;
    padding: 24px 0 56px;
  }

  .rnk-hero,
  .rnk-card,
  .rnk-callout,
  .rnk-form,
  .rnk-table-wrap {
    background: var(--rnk-card);
    border: 1px solid var(--rnk-line);
    box-shadow: var(--rnk-shadow);
    backdrop-filter: blur(18px);
  }

  .rnk-hero {
    position: relative;
    overflow: hidden;
    border-radius: 28px;
    padding: 28px;
    display: grid;
    gap: 18px;
    background:
      radial-gradient(circle at top right, rgba(91, 109, 248, 0.18), transparent 32%),
      linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(255, 240, 249, 0.94));
  }

  .rnk-hero::after {
    content: "";
    position: absolute;
    inset: auto -60px -60px auto;
    width: 180px;
    height: 180px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(214, 31, 140, 0.2), transparent 70%);
    pointer-events: none;
  }

  .rnk-eyebrow {
    display: inline-flex;
    width: fit-content;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(31, 23, 48, 0.06);
    color: var(--rnk-muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .rnk-title {
    margin: 0;
    font-size: clamp(28px, 5vw, 48px);
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .rnk-subtitle,
  .rnk-muted {
    margin: 0;
    color: var(--rnk-muted);
    line-height: 1.7;
  }

  .rnk-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .rnk-card,
  .rnk-callout,
  .rnk-form,
  .rnk-table-wrap {
    border-radius: 24px;
    padding: 20px;
  }

  .rnk-card h2,
  .rnk-callout h2,
  .rnk-form h2 {
    margin: 0 0 10px;
    font-size: 18px;
  }

  .rnk-kpi {
    margin: 10px 0 0;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.04em;
  }

  .rnk-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .rnk-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 8px 12px;
    border-radius: 999px;
    background: var(--rnk-accent-soft);
    color: var(--rnk-accent);
    font-size: 13px;
    font-weight: 600;
  }

  .rnk-pill[data-tone="neutral"] {
    background: rgba(31, 23, 48, 0.06);
    color: var(--rnk-muted);
  }

  .rnk-pill[data-tone="success"] {
    background: rgba(15, 155, 113, 0.12);
    color: var(--rnk-success);
  }

  .rnk-pill[data-tone="warning"] {
    background: rgba(182, 106, 0, 0.12);
    color: var(--rnk-warning);
  }

  .rnk-pill[data-tone="danger"] {
    background: rgba(196, 61, 71, 0.12);
    color: var(--rnk-danger);
  }

  .rnk-list {
    margin: 0;
    padding-left: 18px;
    color: var(--rnk-muted);
    line-height: 1.8;
  }

  .rnk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
  }

  .rnk-button,
  .rnk-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    padding: 12px 16px;
    border-radius: 999px;
    font-weight: 700;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }

  .rnk-button {
    color: white;
    background: linear-gradient(135deg, var(--rnk-accent), var(--rnk-accent-2));
    box-shadow: 0 16px 30px rgba(91, 109, 248, 0.2);
  }

  .rnk-button-secondary {
    color: var(--rnk-ink);
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid var(--rnk-line);
  }

  .rnk-button:hover,
  .rnk-button-secondary:hover {
    transform: translateY(-1px);
  }

  .rnk-split {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .rnk-code {
    margin: 0;
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid rgba(31, 23, 48, 0.08);
    background: rgba(31, 23, 48, 0.04);
    overflow-x: auto;
    color: var(--rnk-ink);
    font-size: 13px;
    line-height: 1.7;
  }

  .rnk-form-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .rnk-field {
    display: grid;
    gap: 8px;
  }

  .rnk-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--rnk-muted);
  }

  .rnk-input,
  .rnk-textarea,
  .rnk-select {
    width: 100%;
    border: 1px solid rgba(31, 23, 48, 0.12);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.94);
    color: var(--rnk-ink);
    font: inherit;
    padding: 12px 14px;
  }

  .rnk-textarea {
    min-height: 180px;
    resize: vertical;
  }

  .rnk-table {
    width: 100%;
    border-collapse: collapse;
  }

  .rnk-table th,
  .rnk-table td {
    padding: 12px 10px;
    text-align: left;
    border-bottom: 1px solid rgba(31, 23, 48, 0.08);
    vertical-align: top;
  }

  .rnk-table th {
    color: var(--rnk-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .rnk-note {
    margin: 0;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(91, 109, 248, 0.08);
    color: var(--rnk-ink);
    line-height: 1.7;
  }

  .rnk-nav-note {
    margin: 14px 0 0;
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(214, 31, 140, 0.08);
    color: var(--rnk-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  @media (max-width: 720px) {
    .rnk-hero,
    .rnk-card,
    .rnk-callout,
    .rnk-form,
    .rnk-table-wrap {
      padding: 18px;
      border-radius: 20px;
    }
  }
`;

export default function App() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
