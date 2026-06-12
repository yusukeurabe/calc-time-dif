# Time zone timeline

A visual time-difference converter for two cities. Two aligned, infinitely scrollable 24-hour timelines make it obvious at a glance what time it is "over there" — including across date boundaries and daylight-saving transitions.

2都市の時差を視覚的・直感的に変換できるウェブアプリです。

**Live: https://calc-time-dif.vercel.app**

## Features

- Two linked hour strips — the same instant always lines up vertically
- Day (amber) / night (purple) coloring, date bands with weekday labels, bold midnight dividers
- Effectively infinite horizontal scrolling through days, plus a date picker to jump
- Draggable cursor (15-minute snap), tap-to-pick, and direct time input
- DST-correct everywhere via the browser's built-in `Intl` API (e.g. Japan ↔ Vancouver switches between −16 h and −17 h automatically)
- 23 selectable major cities, swap button, time-difference badge
- English / Japanese UI toggle, 24-hour format, settings persisted in `localStorage`
- Responsive — works on mobile and desktop

## Tech

Plain HTML + CSS + vanilla JavaScript (ES Modules). No framework, no build step, no dependencies. All time-zone math is done with `Intl.DateTimeFormat` and the IANA time-zone database built into the browser.

## Development

```bash
# run the unit tests (Node.js >= 22)
npm test

# serve locally (any static server works)
python3 -m http.server 8765
```

Design spec and implementation plan live in [docs/superpowers/](docs/superpowers/).
