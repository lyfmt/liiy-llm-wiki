export function renderHtmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #11111a;
        --panel: #1c1c2b;
        --panel-alt: #24243a;
        --panel-deep: #171724;
        --text: #f5f5f0;
        --muted: #b8b8ca;
        --line: #52526b;
        --line-strong: #7b7ba0;
        --accent: #8cf4ff;
        --accent-2: #ffd166;
        --accent-3: #ff8adb;
        --success: #52d273;
        --warning: #ffbe55;
        --danger: #ff6b7a;
        --surface-accent: rgba(140, 244, 255, 0.28);
        --surface-glow: rgba(140, 244, 255, 0.12);
        --focus-ring: rgba(140, 244, 255, 0.32);
        --shadow: 6px 6px 0 #09090f;
        --shadow-soft: 0 0 0 1px #0b0b12 inset, 0 14px 32px rgba(0, 0, 0, 0.28);
      }
      * { box-sizing: border-box; }
      body {
        font-family: "IBM Plex Mono", "Fira Code", monospace;
        margin: 0;
        line-height: 1.55;
        background:
          linear-gradient(180deg, rgba(140, 244, 255, 0.06) 0%, rgba(255, 209, 102, 0.02) 18%, rgba(0, 0, 0, 0) 36%),
          linear-gradient(180deg, #0d0d15 0%, #151523 100%);
        color: var(--text);
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.18;
        background-image:
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
        background-size: 18px 18px;
        mix-blend-mode: soft-light;
      }
      a {
        color: var(--accent);
        text-decoration-thickness: 2px;
        text-underline-offset: 0.18em;
        transition: color 120ms ease, text-shadow 120ms ease;
      }
      a:hover {
        color: #d8fbff;
        text-shadow: 0 0 12px rgba(140, 244, 255, 0.25);
      }
      a:focus-visible,
      button:focus-visible,
      input:focus-visible,
      textarea:focus-visible,
      select:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--focus-ring), var(--shadow-soft);
      }
      nav { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
      form {
        display: grid;
        gap: 0.75rem;
        margin-top: 1rem;
        padding: 0.9rem;
        border: 2px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.04));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.015);
      }
      label { display: grid; gap: 0.25rem; }
      input, textarea, select, button {
        font: inherit;
        padding: 0.65rem 0.75rem;
        border: 2px solid var(--line);
        border-radius: 0;
        background: #121220;
        color: var(--text);
        transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      input:hover, textarea:hover, select:hover {
        border-color: var(--line-strong);
      }
      button {
        cursor: pointer;
        background: var(--accent-2);
        color: #121217;
        font-weight: 700;
        box-shadow: var(--shadow);
      }
      button:hover {
        transform: translate(-1px, -1px);
        box-shadow: 8px 8px 0 #09090f;
      }
      button:active {
        transform: translate(2px, 2px);
        box-shadow: 4px 4px 0 #09090f;
      }
      textarea { min-height: 6rem; }
      form textarea,
      form input,
      form select {
        background: linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.02)), #121220;
      }
      form label {
        padding: 0.2rem 0;
        color: var(--muted);
      }
      form label > input,
      form label > textarea,
      form label > select {
        color: var(--text);
      }
      pre {
        white-space: pre-wrap;
        background: linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.04)), #10101a;
        padding: 1rem;
        border: 2px solid var(--line);
        box-shadow: inset 0 0 0 1px #0b0b12;
        overflow-x: auto;
        line-height: 1.6;
      }
      ul, ol { padding-left: 1.2rem; }
      .app-shell {
        max-width: 1280px;
        margin: 0 auto;
        padding: 1.5rem;
        position: relative;
      }
      .knowledge-shell {
        --surface-accent: rgba(82, 210, 115, 0.28);
        --surface-glow: rgba(82, 210, 115, 0.12);
        --focus-ring: rgba(82, 210, 115, 0.28);
        --shell-band: linear-gradient(180deg, rgba(82, 210, 115, 0.06), rgba(140, 244, 255, 0.03));
      }
      .management-shell {
        --surface-accent: rgba(140, 244, 255, 0.28);
        --surface-glow: rgba(140, 244, 255, 0.12);
        --focus-ring: rgba(140, 244, 255, 0.32);
        --shell-band: linear-gradient(180deg, rgba(140, 244, 255, 0.07), rgba(255, 138, 219, 0.04));
      }
      .hero-panel, .panel, .metric-card {
        background: var(--panel);
        border: 2px solid var(--line);
        box-shadow: var(--shadow);
        position: relative;
        overflow: hidden;
        transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .hero-panel::after, .panel::after, .metric-card::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
      }
      .hero-panel {
        padding: 1.35rem;
        margin-bottom: 1.15rem;
      }
      .hero-panel h1 {
        margin: 0 0 0.45rem;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }
      .hero-panel > p:not(.eyebrow) {
        max-width: 72ch;
        margin: 0 0 1rem;
      }
      .knowledge-shell::before,
      .management-shell::before {
        content: "";
        position: absolute;
        inset: 0 0 auto 0;
        height: 220px;
        pointer-events: none;
        background: var(--shell-band);
        opacity: 0.9;
        filter: saturate(1.05);
      }
      .hero-panel-console {
        background:
          linear-gradient(135deg, rgba(140, 244, 255, 0.08), rgba(255, 138, 219, 0.06)),
          #22192c;
      }
      .panel { padding: 1.05rem; margin-bottom: 1.05rem; }
      .panel,
      .metric-card,
      .console-overview-card,
      .console-fact-card,
      .console-entry-card,
      .console-agent-chip {
        border-radius: 0;
      }
      .status-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 0.8rem;
        margin-bottom: 1.05rem;
        align-items: stretch;
      }
      .metric-card {
        padding: 0.9rem;
        display: grid;
        gap: 0.35rem;
        align-content: start;
        background: linear-gradient(180deg, rgba(255,255,255,0.03), var(--surface-glow)), var(--panel);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset, var(--shadow);
      }
      .metric-card strong,
      .metric-card .status-pill {
        font-size: 1.05rem;
      }
      .metric-card .metric-label {
        margin-bottom: 0.15rem;
      }
      .metric-card:hover {
        border-color: var(--surface-accent);
        transform: translateY(-1px);
        box-shadow: 8px 8px 0 #09090f;
      }
      .console-overview-strip, .console-fact-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.8rem;
      }
      .console-overview-strip {
        margin-bottom: 1.05rem;
      }
      .console-overview-card, .console-fact-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0.04)), var(--panel-alt);
        border: 2px solid var(--line);
        padding: 0.85rem;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset, var(--shadow-soft);
        display: grid;
        gap: 0.25rem;
        position: relative;
        transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .console-overview-card:hover, .console-fact-card:hover {
        border-color: var(--surface-accent);
        box-shadow: 0 0 0 1px #0b0b12 inset, 0 18px 34px rgba(0, 0, 0, 0.34);
        transform: translateY(-1px);
      }
      .console-fact-card strong, .console-overview-card strong {
        font-size: 1rem;
      }
      .console-stage-panel {
        background:
          linear-gradient(180deg, var(--surface-glow), rgba(255, 138, 219, 0.03)),
          var(--panel);
      }
      .console-shell-elevated {
        padding: 0.35rem;
        border: 2px solid var(--line-strong);
        background: var(--panel-deep);
        box-shadow: var(--shadow-soft);
      }
      .workspace-pane-shell {
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.10) inset, inset 0 0 28px rgba(140, 244, 255, 0.04), var(--shadow-soft);
      }
      .workspace-pane-header {
        align-items: center;
      }
      .workspace-pane-status {
        display: inline-flex;
        align-items: center;
        padding: 0.4rem 0.65rem;
        border: 2px solid rgba(140, 244, 255, 0.22);
        background: rgba(140, 244, 255, 0.05);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.06) inset;
      }
      .workspace-pane-capabilities {
        margin-bottom: 0.8rem;
      }
      .workspace-pane-frame {
        display: grid;
        gap: 0;
        border: 2px solid rgba(140, 244, 255, 0.2);
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.08)), var(--panel-deep);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.08) inset;
      }
      .workspace-pane-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        padding: 0.55rem 0.65rem;
        border-bottom: 2px solid rgba(140, 244, 255, 0.12);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.06), rgba(255,255,255,0.01));
      }
      .workspace-pane-tab {
        display: inline-flex;
        align-items: center;
        padding: 0.22rem 0.55rem;
        border: 2px solid rgba(140, 244, 255, 0.16);
        background: rgba(0,0,0,0.14);
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.76rem;
      }
      .workspace-pane-tab-active {
        color: var(--text);
        border-color: rgba(140, 244, 255, 0.38);
        background: rgba(140, 244, 255, 0.10);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.08) inset;
      }
      .workspace-pane-console-shell {
        border: 0;
        box-shadow: none;
        background: transparent;
        padding: 0.7rem;
      }
      .workspace-console-grid {
        position: relative;
      }
      .workspace-command-strip {
        position: relative;
        display: grid;
        gap: 0.8rem;
        padding: 0.95rem;
        border: 2px solid rgba(255, 209, 102, 0.34);
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.08), rgba(140, 244, 255, 0.04)), var(--panel-alt);
        box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.10) inset, 0 0 22px rgba(255, 209, 102, 0.05), var(--shadow-soft);
      }
      .workspace-command-strip::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 6px;
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.9), rgba(255, 138, 219, 0.24));
        box-shadow: 1px 0 0 rgba(0, 0, 0, 0.32) inset;
      }
      .workspace-command-strip-grid {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
      .workspace-console-card {
        position: relative;
        overflow: hidden;
      }
      .workspace-console-card::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 5px;
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.72), rgba(255, 138, 219, 0.24));
        box-shadow: 1px 0 0 rgba(0, 0, 0, 0.32) inset;
      }
      .workspace-console-card-status::before {
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.82), rgba(140, 244, 255, 0.24));
      }
      .workspace-console-card-feed::before {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.82), rgba(140, 244, 255, 0.24));
      }
      .workspace-console-card-progress::before {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.74), rgba(255, 209, 102, 0.24));
      }
      .workspace-console-card-plan::before {
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.82), rgba(255, 209, 102, 0.22));
      }
      .workspace-console-card-timeline::before {
        background: linear-gradient(180deg, rgba(255, 138, 219, 0.84), rgba(140, 244, 255, 0.22));
      }
      .workspace-console-card-tool::before {
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.86), rgba(82, 210, 115, 0.22));
      }
      .workspace-console-card-evidence::before,
      .workspace-console-card-decision::before,
      .workspace-console-card-result::before {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.78), rgba(255, 138, 219, 0.2));
      }
      .workspace-console-card-live-rail {
        box-shadow: 0 0 0 1px rgba(255, 138, 219, 0.16) inset, 0 0 26px rgba(255, 138, 219, 0.06), var(--shadow-soft);
      }
      .workspace-live-rail-label {
        margin: 0 0 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.76rem;
      }
      .workspace-pane-footer {
        margin-top: 0.8rem;
      }
      .launch-lifecycle-strip,
      .launch-receipt-shell {
        position: relative;
        margin-top: 0.9rem;
        overflow: hidden;
      }
      .launch-lifecycle-strip::before,
      .launch-receipt-shell::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 6px;
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.9), rgba(140, 244, 255, 0.26));
        box-shadow: 1px 0 0 rgba(0, 0, 0, 0.32) inset;
      }
      .launch-receipt-shell::before {
        background: linear-gradient(180deg, rgba(255, 138, 219, 0.88), rgba(140, 244, 255, 0.24));
      }
      .launch-receipt-state-idle::before {
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.88), rgba(140, 244, 255, 0.22));
      }
      .launch-receipt-state-accepted::before,
      .launch-receipt-state-running::before {
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.9), rgba(82, 210, 115, 0.24));
      }
      .launch-receipt-state-needs_review::before {
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.92), rgba(255, 138, 219, 0.24));
      }
      .launch-receipt-state-failed::before {
        background: linear-gradient(180deg, rgba(255, 107, 122, 0.94), rgba(255, 138, 219, 0.22));
      }
      .launch-receipt-state-done::before,
      .launch-receipt-state-settled::before {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.92), rgba(140, 244, 255, 0.22));
      }
      .launch-lifecycle-grid {
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      }
      .launch-receipt-body {
        display: grid;
        gap: 0.75rem;
      }
      .launch-receipt-links {
        margin: 0.85rem 0 0;
      }
      .launch-receipt-raw-shell {
        margin-top: 0.85rem;
        border: 2px solid rgba(255,255,255,0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.04));
        padding: 0.75rem;
      }
      .launch-receipt-raw-shell summary {
        cursor: pointer;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.78rem;
      }
      .launch-receipt-raw {
        margin-top: 0.75rem;
      }
      .workspace-launch-panel,
      .workspace-guided-panel,
      .session-list-panel,
      .runtime-dock-panel {
        position: relative;
        overflow: hidden;
      }
      .workspace-launch-panel::before,
      .workspace-guided-panel::before,
      .session-list-panel::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 6px;
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.85), rgba(140, 244, 255, 0.3));
        box-shadow: 1px 0 0 rgba(0, 0, 0, 0.35) inset;
      }
      .workspace-guided-panel::before {
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.9), rgba(255, 138, 219, 0.35));
      }
      .session-list-panel::before {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.9), rgba(140, 244, 255, 0.25));
      }
      .runtime-dock-panel::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 6px;
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.9), rgba(255, 138, 219, 0.28));
        box-shadow: 1px 0 0 rgba(0, 0, 0, 0.35) inset;
      }
      .runtime-dock-panel-readiness::before {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.92), rgba(140, 244, 255, 0.28));
      }
      .runtime-dock-panel-profile::before {
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.92), rgba(255, 209, 102, 0.28));
      }
      .runtime-dock-panel-spotlight::before {
        background: linear-gradient(180deg, rgba(255, 138, 219, 0.92), rgba(140, 244, 255, 0.28));
      }
      .runtime-dock {
        display: grid;
        gap: 0.9rem;
        align-content: start;
      }
      .runtime-dock-header {
        align-items: center;
        gap: 0.85rem;
      }
      .runtime-dock-header > div {
        display: grid;
        gap: 0.25rem;
      }
      .runtime-dock-fact-grid {
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      }
      .runtime-dock-note {
        margin-top: 0.85rem;
      }
      .runtime-spotlight-grid .console-fact-card strong {
        line-height: 1.4;
      }
      .workspace-zone-header {
        align-items: center;
        gap: 0.85rem;
      }
      .workspace-zone-header > div {
        display: grid;
        gap: 0.25rem;
      }
      .metric-label, .eyebrow {
        display: block;
        color: var(--muted);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 0.35rem;
      }
      .panel h2,
      .panel h3,
      .console-entry-card h2 {
        margin-top: 0;
        margin-bottom: 0.4rem;
        line-height: 1.18;
        letter-spacing: -0.015em;
      }
      .split-layout {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
        gap: 1rem;
      }
      .split-layout-dashboard {
        align-items: start;
      }
      .split-layout-console {
        grid-template-columns: minmax(0, 1.8fr) minmax(320px, 0.9fr);
        align-items: start;
      }
      .dashboard-hero-panel {
        border-color: rgba(140, 244, 255, 0.35);
      }
      .console-entry-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 0.85rem;
        margin-top: 0.75rem;
      }
      .console-entry-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.04)), var(--panel-alt);
        border: 2px solid var(--line);
        padding: 0.9rem;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.03) inset, var(--shadow-soft);
        display: grid;
        gap: 0.65rem;
      }
      .console-entry-card h2 {
        margin: 0;
      }
      .console-entry-card-knowledge {
        border-color: rgba(82, 210, 115, 0.36);
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.08), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .console-entry-card-operations {
        border-color: rgba(140, 244, 255, 0.38);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.08), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .dashboard-surface-panel {
        background: linear-gradient(180deg, var(--surface-glow), rgba(255, 138, 219, 0.03)), var(--panel);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.06) inset, var(--shadow-soft);
      }
      .dashboard-spotlight-panel {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), var(--surface-glow)), var(--panel);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.03) inset, var(--shadow-soft);
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 0.85rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .panel-header > :first-child {
        min-width: 0;
      }
      .panel-header > strong,
      .panel-header > .status-pill,
      .panel-header > .callout {
        flex-shrink: 0;
      }
      .panel-link {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        white-space: nowrap;
        padding: 0.35rem 0.55rem;
        border: 2px solid rgba(140, 244, 255, 0.18);
        background: rgba(140, 244, 255, 0.04);
        text-decoration: none;
      }
      .panel-link:hover {
        border-color: var(--surface-accent);
        background: rgba(140, 244, 255, 0.08);
      }
      .button-row {
        display: flex;
        gap: 0.8rem;
        flex-wrap: wrap;
        align-items: center;
      }
      .action-grid {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        align-items: stretch;
      }
      .secondary-action {
        width: 100%;
        text-align: left;
        background: #151524;
        color: var(--text);
        border-color: var(--line);
        box-shadow: var(--shadow-soft);
      }
      .secondary-action:hover {
        border-color: var(--accent);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.08), rgba(255,255,255,0.01)), #151524;
      }
      .secondary-action.is-selected {
        border-color: var(--accent);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.16), rgba(255,255,255,0.02)), #18182a;
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.18) inset, var(--shadow-soft);
      }
      .run-summary-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.85rem;
      }
      .run-summary-item {
        display: grid;
        gap: 0.55rem;
        padding: 0.85rem;
        background: var(--panel-alt);
        border: 2px solid var(--line);
        box-shadow: var(--shadow-soft);
        transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .run-summary-item:hover {
        border-color: var(--surface-accent);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.05), rgba(255,255,255,0.01)), var(--panel-alt);
        transform: translateY(-1px);
      }
      .run-summary-item.is-selected {
        border-color: var(--accent);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.12), rgba(255,255,255,0.015)), var(--panel-alt);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.18) inset, var(--shadow-soft);
      }
      .session-list {
        gap: 0.7rem;
      }
      .session-list-item {
        padding: 0;
        overflow: hidden;
      }
      .session-list-row {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr);
        gap: 0;
        min-height: 100%;
      }
      .session-list-rail {
        display: flex;
        align-items: stretch;
        justify-content: center;
        padding: 0.9rem 0 0.9rem 0.55rem;
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.08));
        border-right: 1px solid rgba(255,255,255,0.05);
      }
      .session-list-dot {
        width: 10px;
        min-width: 10px;
        height: 10px;
        margin-top: 0.15rem;
        border: 2px solid #0b0b12;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.05) inset;
        background: var(--muted);
      }
      .session-list-dot.status-running { background: var(--accent-2); }
      .session-list-dot.status-done,
      .session-list-dot.status-ready { background: var(--success); }
      .session-list-dot.status-needs_review { background: var(--warning); }
      .session-list-dot.status-failed,
      .session-list-dot.status-rejected,
      .session-list-dot.status-missing_api_key,
      .session-list-dot.status-missing_graph_database_url,
      .session-list-dot.status-missing_api_key_and_graph_database_url { background: var(--danger); }
      .session-list-item .run-summary-layout {
        padding: 0.9rem;
      }
      .session-list-item .run-summary-actions {
        align-content: start;
      }
      .session-list-item.is-selected {
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.22) inset, 0 0 28px rgba(140, 244, 255, 0.10), var(--shadow-soft);
      }
      .runtime-dock-panel.is-linked-selection {
        box-shadow: 0 0 0 1px rgba(255, 138, 219, 0.22) inset, 0 0 32px rgba(255, 138, 219, 0.12), var(--shadow-soft);
        border-color: rgba(255, 138, 219, 0.72);
      }
      .run-summary-layout {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(220px, 1fr);
        gap: 0.85rem;
        align-items: start;
      }
      .run-summary-primary,
      .run-summary-actions {
        display: grid;
        gap: 0.45rem;
      }
      .run-summary-kicker {
        margin: 0;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.78rem;
      }
      .run-summary-meta {
        color: var(--muted);
      }
      .run-console-shell {
        display: grid;
        gap: 0.85rem;
      }
      .console-card-primary {
        background: linear-gradient(180deg, var(--surface-glow), rgba(255,255,255,0.01)), var(--panel-alt);
        border-color: var(--line-strong);
      }
      .console-card-feed {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.05), rgba(255,255,255,0.01)), var(--panel-alt);
        border-color: rgba(82, 210, 115, 0.3);
      }
      .run-console-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 0.85rem;
      }
      .console-card {
        background: var(--panel-alt);
        border: 2px solid var(--line);
        padding: 0.95rem;
        box-shadow: inset 0 0 0 1px #0b0b12;
        transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease, transform 120ms ease;
      }
      .console-card:hover {
        transform: translateY(-1px);
      }
      .console-surface-live {
        background: linear-gradient(180deg, rgba(255, 138, 219, 0.09), rgba(255,255,255,0.01)), var(--panel-alt);
        border-color: rgba(255, 138, 219, 0.42);
        box-shadow: 0 0 0 1px rgba(255, 138, 219, 0.10) inset, inset 0 0 22px rgba(255, 138, 219, 0.04);
      }
      .console-surface-live:hover {
        border-color: rgba(255, 138, 219, 0.68);
        box-shadow: 0 0 0 1px rgba(255, 138, 219, 0.16) inset, 0 18px 34px rgba(0, 0, 0, 0.34);
      }
      .console-surface-governed {
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.09), rgba(255,255,255,0.01)), var(--panel-alt);
        border-color: rgba(140, 244, 255, 0.42);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.10) inset, inset 0 0 22px rgba(140, 244, 255, 0.04);
      }
      .console-surface-governed:hover {
        border-color: rgba(140, 244, 255, 0.7);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.16) inset, 0 18px 34px rgba(0, 0, 0, 0.34);
      }
      .console-surface-persisted {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.09), rgba(255,255,255,0.01)), var(--panel-alt);
        border-color: rgba(82, 210, 115, 0.38);
        box-shadow: 0 0 0 1px rgba(82, 210, 115, 0.09) inset, inset 0 0 22px rgba(82, 210, 115, 0.04);
      }
      .console-surface-persisted:hover {
        border-color: rgba(82, 210, 115, 0.66);
        box-shadow: 0 0 0 1px rgba(82, 210, 115, 0.16) inset, 0 18px 34px rgba(0, 0, 0, 0.34);
      }
      .console-card h3 {
        margin-top: 0;
      }
      .console-stage-kicker {
        margin: -0.1rem 0 0.9rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.76rem;
      }
      .console-card-feed-stage {
        box-shadow: 0 0 0 1px rgba(82, 210, 115, 0.12) inset, inset 0 0 26px rgba(82, 210, 115, 0.05), var(--shadow-soft);
      }
      .console-card-timeline-stage {
        box-shadow: 0 0 0 1px rgba(255, 138, 219, 0.12) inset, inset 0 0 26px rgba(255, 138, 219, 0.05), var(--shadow-soft);
      }
      .console-card-tool-stage {
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.12) inset, inset 0 0 26px rgba(140, 244, 255, 0.05), var(--shadow-soft);
      }
      .console-card-progress {
        box-shadow: 0 0 0 1px rgba(82, 210, 115, 0.08) inset, var(--shadow-soft);
      }
      .console-card-plan {
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.08) inset, var(--shadow-soft);
      }
      .console-agent-header {
        background: linear-gradient(135deg, rgba(255, 209, 102, 0.10), rgba(140, 244, 255, 0.10), rgba(255, 138, 219, 0.06)), var(--panel-alt);
        border-color: rgba(255, 209, 102, 0.42);
        box-shadow: 0 0 0 1px rgba(255, 209, 102, 0.08) inset, var(--shadow-soft);
      }
      .console-agent-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 0.75rem;
      }
      .console-agent-chip {
        display: grid;
        gap: 0.35rem;
        padding: 0.8rem;
        border: 2px solid rgba(255,255,255,0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.06));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
      }
      .console-agent-chip strong {
        line-height: 1.4;
      }
      .console-fact-card-live {
        border-color: rgba(255, 209, 102, 0.42);
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.10), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .console-fact-card-phase {
        border-color: rgba(140, 244, 255, 0.42);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.10), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .console-fact-card-active {
        border-color: rgba(255, 138, 219, 0.42);
        background: linear-gradient(180deg, rgba(255, 138, 219, 0.10), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .console-fact-card-output {
        border-color: rgba(82, 210, 115, 0.42);
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.10), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .console-fact-card-review {
        border-color: rgba(255, 209, 102, 0.42);
        background: linear-gradient(180deg, rgba(255, 209, 102, 0.10), rgba(255,255,255,0.01)), var(--panel-alt);
      }
      .console-card-wide {
        grid-column: 1 / -1;
      }
      .mini-list {
        margin: 0;
        padding-left: 1.2rem;
        display: grid;
        gap: 0.45rem;
      }
      .inline-facts {
        display: grid;
        gap: 0.45rem;
        list-style: none;
        padding: 0.85rem;
        margin: 0;
        border: 2px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.04));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.015);
      }
      .status-pill {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        border: 2px solid currentColor;
        font-weight: 700;
        text-transform: uppercase;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.22) inset, 0 0 14px rgba(255,255,255,0.04);
      }
      .status-running { color: var(--accent-2); }
      .status-done, .status-ready { color: var(--success); }
      .status-needs_review { color: var(--warning); }
      .status-failed,
      .status-rejected,
      .status-missing_api_key,
      .status-missing_graph_database_url,
      .status-missing_api_key_and_graph_database_url { color: var(--danger); }
      .tool-trace, .timeline, .agent-feed { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.9rem; }
      .tool-card, .timeline-item, .feed-card {
        background: var(--panel-alt);
        border: 2px solid var(--line);
        padding: 0.9rem;
        box-shadow: var(--shadow-soft);
        transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
      }
      .tool-card:hover, .timeline-item:hover, .feed-card:hover {
        transform: translateY(-1px);
      }
      .tool-card {
        border-color: rgba(140, 244, 255, 0.48);
        background: linear-gradient(180deg, rgba(140, 244, 255, 0.09), rgba(255,255,255,0.01)), var(--panel-alt);
        box-shadow: 0 0 0 1px rgba(140, 244, 255, 0.10) inset, var(--shadow-soft);
      }
      .tool-card:hover {
        border-color: rgba(140, 244, 255, 0.7);
        box-shadow: 0 0 0 1px #0b0b12 inset, 0 18px 34px rgba(0, 0, 0, 0.34);
      }
      .timeline-item {
        display: grid;
        grid-template-columns: 14px minmax(0, 1fr);
        gap: 0.9rem;
        border-color: rgba(255, 138, 219, 0.42);
        background: linear-gradient(180deg, rgba(255, 138, 219, 0.08), rgba(255,255,255,0.01)), var(--panel-alt);
        box-shadow: 0 0 0 1px rgba(255, 138, 219, 0.10) inset, var(--shadow-soft);
      }
      .timeline-item:hover {
        border-color: rgba(255, 138, 219, 0.6);
        box-shadow: 0 0 0 1px #0b0b12 inset, 0 18px 34px rgba(0, 0, 0, 0.34);
      }
      .feed-card {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.08), rgba(255,255,255,0.01)), var(--panel-alt);
        box-shadow: 0 0 0 1px rgba(82, 210, 115, 0.10) inset, var(--shadow-soft);
      }
      .feed-card:hover {
        border-color: rgba(82, 210, 115, 0.55);
        box-shadow: 0 0 0 1px #0b0b12 inset, 0 18px 34px rgba(0, 0, 0, 0.34);
      }
      .feed-kicker,
      .tool-kicker,
      .timeline-kicker {
        margin: 0 0 0.35rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.8rem;
        line-height: 1.3;
      }
      .trace-summary {
        margin: 0;
        color: var(--text);
        line-height: 1.5;
      }
      .trace-meta,
      .trace-meta-list {
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.5;
      }
      .trace-meta-list {
        gap: 0.3rem;
      }
      .trace-payload-shell {
        margin-top: 0.7rem;
      }
      .trace-payload {
        border-color: rgba(255,255,255,0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.015), rgba(0,0,0,0.05)), rgba(8, 8, 14, 0.45);
      }
      .feed-user { border-color: var(--accent); }
      .feed-assistant { border-color: var(--success); }
      .feed-tool { border-color: var(--accent-2); }
      .feed-system { border-color: var(--accent-3); }
      .timeline-marker {
        width: 14px;
        height: 14px;
        margin-top: 1.65rem;
        background: var(--accent);
        border: 2px solid #0c0c14;
      }
      .timeline-run_failed { background: var(--danger); }
      .timeline-run_completed { background: var(--success); }
      .timeline-tool_started, .timeline-plan_available { background: var(--accent-2); }
      .timeline-meta, .callout { color: var(--muted); }
      .panel h2,
      .panel h3 {
        margin-top: 0;
        margin-bottom: 0.2rem;
        line-height: 1.3;
      }
      .panel p {
        line-height: 1.55;
        margin-top: 0;
      }
      .empty-state {
        display: grid;
        gap: 0.4rem;
        padding: 0.9rem;
        border: 2px dashed var(--line);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), var(--surface-glow));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
      }
      .empty-state strong { color: var(--text); }
      .knowledge-shell .hero-panel {
        background: linear-gradient(135deg, rgba(82, 210, 115, 0.08), rgba(140, 244, 255, 0.05)), #171724;
      }
      .knowledge-hero-panel {
        border-color: rgba(82, 210, 115, 0.35);
      }
      .knowledge-highlight-panel,
      .knowledge-reading-panel,
      .knowledge-context-panel,
      .knowledge-facts-panel {
        background: linear-gradient(180deg, rgba(82, 210, 115, 0.04), rgba(140, 244, 255, 0.02)), var(--panel);
      }
      .management-shell .hero-panel {
        background: linear-gradient(135deg, rgba(140, 244, 255, 0.08), rgba(255, 138, 219, 0.06)), #22192c;
      }
      @media (max-width: 900px) {
        .app-shell {
          padding: 1rem;
        }
        .split-layout, .split-layout-console { grid-template-columns: 1fr; }
        .panel-header { flex-direction: column; }
        .workspace-zone-header {
          align-items: flex-start;
        }
        .status-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .action-grid {
          grid-template-columns: 1fr;
        }
        .button-row {
          flex-direction: column;
          align-items: stretch;
        }
        .button-row > * {
          width: 100%;
        }
        .run-summary-layout {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 640px) {
        .app-shell {
          padding: 0.75rem;
        }
        .hero-panel,
        .panel,
        .metric-card {
          box-shadow: 4px 4px 0 #09090f;
        }
        .status-strip,
        .console-overview-strip,
        .console-fact-grid,
        .run-console-grid {
          grid-template-columns: 1fr;
        }
        nav {
          gap: 0.65rem;
        }
        .panel-link {
          width: 100%;
          justify-content: center;
        }
      }
    </style>
    <script>
      function splitLines(value) {
        return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
      }
      function parseOptionalBoolean(value) {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return undefined;
      }
      function parseOptionalNumber(value) {
        if (value.trim() === '') return undefined;
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
      }
      async function submitJson(url, method, payload, resultId) {
        const response = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const text = await response.text();
        const target = document.getElementById(resultId);
        if (target) {
          target.textContent = text;
        }

        try {
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      }
    </script>
  </head>
  <body>${body}</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeJsString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
