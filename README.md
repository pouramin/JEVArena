# JEVArena

JEVArena is a visual routing benchmark built around one simple question:

**What happens when a tiny decision model chooses the expensive model only when it is actually needed?**

The interface runs one prompt down two visible paths:

- **JEV Route** — JEV classifies the task, selects an Anthropic tier, then the routed model runs.
- **Direct Model** — a manually selected Anthropic or OpenAI model runs the same prompt without a router.

The goal is to make model routing understandable in one frame: model choice, confidence, latency, token estimate, cost, and the final delta are all visible without logs or a terminal.

## Current milestone

The first milestone is intentionally **simulation-first**. It is reliable for UI development, screen recording, and explaining the routing concept before provider credentials or backend infrastructure are involved.

Included now:

- Three-column arena: JEV / prompt / direct model
- Anthropic and OpenAI model selectors
- Live race timers and animated cost counters
- JEV complexity classification and confidence visualization
- Per-route execution timeline
- Cost and latency verdict panel
- Preset benchmark prompts
- Presentation / fullscreen mode
- Responsive desktop, tablet, and mobile layouts
- GitHub Actions build and Pages deployment workflow

## Model configuration

Model metadata and list-price configuration live in:

src/data/models.ts

The current catalog includes Anthropic Haiku, Sonnet and Opus tiers plus OpenAI Luna, Sol and Astra tiers. Pricing is configuration data rather than UI logic so it can be updated independently.

## Simulation

Simulation logic lives in:

src/lib/simulator.ts

Simulation timing is illustrative by design. Cost calculations use the configured token estimates and per-million-token list prices. The interface labels the current mode clearly so simulated values are not presented as live measurements.

## Next milestone: Live mode

Live mode should use a server-side bridge rather than exposing provider keys in the browser.

Recommended architecture:

GitHub Pages UI → Cloudflare Worker → JEV / Anthropic / OpenAI

The browser should receive normalized benchmark events while all secrets stay server-side.

Planned live events:

1. Prompt received
2. JEV request sent
3. JEV decision and confidence
4. Routed model request sent
5. First token
6. Completion
7. Provider-reported token usage
8. Final calculated cost

## Local development

Install dependencies:

npm install

Start development:

npm run dev

Production build:

npm run build

## Branches

- main — stable and Pages deployment
- dev — active development

## Product principle

JEVArena should feel like a visual instrument, not an admin dashboard. The result has to be understandable while watching a video without pausing to read technical logs.
