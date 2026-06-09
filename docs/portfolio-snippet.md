# Portfolio snippet — paste-ready copy & component

Everything here is honest to the current live numbers (model **transparently
benchmarks** against NESO; it does not currently beat NESO's day-ahead forecast).
Update figures from the live `/api/accuracy` endpoint when you refresh.

---

## A. One-liners (pick by audience)

- **Default:** A live, self-updating service that forecasts UK grid carbon intensity 48 h ahead, benchmarks its own model against the national grid operator's forecast in public, and tells you the cleanest and cheapest time to use power.
- **ML-leaning:** End-to-end ML system — automated ingestion, weather-driven features, recursive 48 h forecasting with time-aware backtesting — that scores every prediction against the metered actual and publishes the result.
- **Energy / climate-tech:** A grid-flexibility tool: marginal-emissions estimates and a carbon-vs-price "best time to run" scheduler built on a self-updating 48 h carbon forecast.

## B. Tech tags (for the card)

`Next.js` · `TypeScript` · `scikit-learn` · `Postgres` · `GitHub Actions` · `Vercel`

## C. Metric chips

- 48 h forecast horizon · half-hourly
- ~17k+ half-hourly training samples · ~1 yr history
- Hourly ingest · nightly retrain (fully automated)
- £0 running cost

## D. Highlight bullets (3–4 on the card)

- Forecasts GB grid carbon 48 h ahead and **publishes its realised accuracy vs the national operator** — honest benchmarking the official dashboard never shows.
- **Recursive multi-step forecasting** (no future leakage) + time-aware backtesting, retrained nightly via GitHub Actions.
- A **carbon-vs-price scheduler** that finds the cleanest/cheapest window to run a load, using **marginal** (not just average) emissions.
- Decoupled batch-training / serverless-serving architecture on one shared Postgres; graceful degradation when the DB is down.

## E. Résumé / LinkedIn bullets (quantified, honest)

- Built and deployed a **live, self-updating** UK grid carbon-forecasting service (Next.js, scikit-learn, Neon Postgres) producing a 48-hour forecast and **transparently benchmarking it against the national operator's forecast**, publishing realised accuracy.
- Engineered an end-to-end ML pipeline — automated ingestion, weather-driven feature engineering, and **recursive multi-step forecasting with time-aware backtesting** — retrained nightly via GitHub Actions at **zero infrastructure cost**.
- Added a flexibility layer (**marginal-emissions estimate + a carbon-vs-price "best time to run" scheduler**) translating forecasts into actionable load-shifting decisions.

## F. GIF shot-list (the hero asset)

1. Land on the dashboard (gauge + forecast chart visible).
2. In the scheduler, click **Cleanest → Cheapest**: the shaded window on the forecast chart jumps. (This single interaction tells the whole story — make it the loop.)
3. Toggle the Current Intensity card **Average → Marginal** (the value jumps to ~394).
4. Hold 1 s on the accuracy table (model vs NESO) before looping.

Keep it 6–10 s, ~1000px wide. Tools: ScreenToGif (Windows) or the macOS screen recorder → gif.

---

## G. Paste-ready Next.js component (Tailwind)

Drop this into your portfolio (e.g. `components/CarbonProjectCard.tsx`) and render it
where your projects live. Self-contained — no external UI library, just Tailwind.
Add your GIF at `/public/projects/carbon.gif` (or change `media.src`).

```tsx
// components/CarbonProjectCard.tsx
const project = {
  title: "UK Grid Carbon Intensity Forecasting",
  tagline:
    "A live, self-updating service that forecasts Britain's grid carbon 48h ahead, " +
    "benchmarks its own model against the national operator in public, and finds the " +
    "cleanest & cheapest time to use power.",
  liveUrl: "https://carbon-intensity-forecasting.vercel.app",
  codeUrl: "https://github.com/zubairahmad054/carbon-intensity-forecast",
  media: { src: "/projects/carbon.gif", alt: "Carbon forecasting dashboard demo" },
  tags: ["Next.js", "TypeScript", "scikit-learn", "Postgres", "GitHub Actions", "Vercel"],
  metrics: [
    { label: "Horizon", value: "48h" },
    { label: "Cost to run", value: "£0" },
    { label: "Retrain", value: "Nightly" },
  ],
  highlights: [
    "Publishes its realised accuracy vs the national operator — honest benchmarking the official dashboard never shows.",
    "Recursive multi-step forecasting (no leakage) + time-aware backtesting, retrained nightly via GitHub Actions.",
    "Carbon-vs-price scheduler that finds the cleanest/cheapest window using marginal — not just average — emissions.",
  ],
}

export default function CarbonProjectCard() {
  return (
    <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Media */}
      <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={project.media.src}
          alt={project.media.alt}
          className="aspect-[16/9] w-full object-cover"
        />
      </a>

      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {project.title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{project.tagline}</p>
        </div>

        {/* Metric chips */}
        <div className="flex flex-wrap gap-2">
          {project.metrics.map((m) => (
            <span
              key={m.label}
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            >
              {m.label}: {m.value}
            </span>
          ))}
        </div>

        {/* Highlights */}
        <ul className="space-y-1.5">
          {project.highlights.map((h) => (
            <li key={h} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <span aria-hidden className="mt-0.5 text-emerald-500">▸</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Live demo
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17 17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a
            href={project.codeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.7c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 5 18.3 5.3 18.3 5.3c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
            </svg>
            Code
          </a>
        </div>
      </div>
    </article>
  )
}
```

### Notes
- If your portfolio isn't on Tailwind, ignore the component and use sections A–F as plain copy.
- The `▸` bullet and emerald accent are easy to recolour to match your site's palette.
- For a dedicated case-study page, render the full narrative from `CASE_STUDY.md` (e.g. via MDX or `next-mdx-remote`).
