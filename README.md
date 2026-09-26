# Shoe Rack

A phone app for keeping the family shoe rack in order. Photograph a pair — or
the whole rack at once — and Claude works out what each pair is, what state
it's in, and which shelf it belongs on. Then the app keeps up with the family:
what gets worn, what's outgrown, what needs a clean, what could go, and what to
wear with what.

It's an installable web app: open it in the phone's browser, then use
**Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android).

## How the rack works

Tell it your real rack in **Plan shelves**: how many shelves, and how many
pairs fit on one. The layout is a list of shelves, top first, and each shelf
holds one or more types — a big sneaker collection can span two shelves, and a
few boots and slippers can share one. Shelves fill top-down; when a type's
shelf is full it spills onto its next one, and anything with no room left is
listed under **No room on the rack**.

**Suggested layout** builds that plan for you from what the family actually
wears: the most-worn types go on the top (easiest to reach) shelves, a type
bigger than a shelf gets several, and small types share instead of leaving a
shelf half empty. It never uses more shelves than you have, and says how many
pairs won't fit.

No pair stores a shelf number. Where a pair goes is worked out from the plan
every time, so changing the plan moves every pair with it. Within a shelf, daily
pairs go at the front, then pairs are grouped by person — open a shelf to see
the exact left-to-right order.

## Screens

- **Rack** — every shelf as a coloured pill, with how full it is. Filter by
  person. Quick actions: **Scan rack**, **Tidy check**, **Plan shelves**.
- **+ Add New Pair** — take a photo; Claude fills in type, colour, name, brand,
  a printed size if it can read one, and the condition with a care tip.
  Anything you pick yourself is never overwritten.
- **Scan rack** — one photo of the rack finds every pair, cuts each one out of
  the photo, and flags the ones that look like pairs you've already saved, so a
  second scan doesn't double up. Review, set owners, add them all.
- **Tidy check** — photograph a shelf; get the pairs that belong and the ones to
  move, with the shelf they should go to.
- **Insights** — tap what each person wore today. From that, and from sizes and
  photos, it lists: children's pairs that are now too small, feet due a
  measure, pairs that need a clean or replacing, and pairs nobody has worn in
  four months (Keep hides one for six months).
- **Style** — photograph a dress or outfit and get the best shoes for it from
  the chosen person's pairs, plus alternatives and what would suit it better if
  nothing does. Or pick a pair and get three outfit ideas for it.
- **Ask** — ask anything about the rack: "Where are Ali's school shoes?",
  "What haven't we worn this year?", "What goes with a navy suit?"
- **Family** — each person, their shoe size, and whether they're a child whose
  feet are still growing.

## The API key, and what leaves the phone

Recognition uses Claude through Anthropic's API, so it needs your own API key.
Get one at console.anthropic.com and paste it into Settings.

- The key is kept in this browser's storage on this phone, and sent only to
  `api.anthropic.com`.
- What each feature sends is listed at the top of `js/ai.js`, and
  `test/ai.test.mjs` checks it against the built requests:
  - recognise, scan, tidy check: **one photo** (shrunk to 1024–1600px)
  - Style: the outfit photo plus a text list of candidate pairs with **no
    owners**, or one pair's photo
  - Ask: **text only** — your question, the last few turns, and a list of the
    rack (type, colour, name, brand, owner's **first name**, size, shelf,
    condition, days since last worn). Never photos, never surnames.
- A photo costs roughly one or two US cents; a whole-rack scan or a Style
  answer a little more.
- Without a key, or offline, everything still works. You choose the type
  yourself; it's one tap.

A key kept in the browser is fine for one family phone. **Don't host this
publicly with your key in it.** If the app is ever shared beyond your household,
put a small server (such as a Cloudflare Worker) between the app and Anthropic
so the key lives there instead.

Everything else — pairs, photos, wear history, family, layout — stays on the
phone (IndexedDB and localStorage). **Settings → Save a backup** writes it all
to one file you can restore later. Backups from the first version still
restore.

## Running it

It's plain HTML, CSS and JavaScript: no build step and no dependencies to install.

```sh
npm start        # serves on http://localhost:8080
npm test         # Node's built-in test runner
```

The camera and the install prompt need HTTPS, except on `localhost`. To use it
on a phone, host the folder on any static host, for example GitHub Pages,
Netlify or Cloudflare Pages.

## Files

```
index.html            the page and the bottom navigation
css/app.css           the whole design system
js/app.js             routing only
js/shared.js          state and helpers every screen uses
js/views/*.js         one file per screen
js/rack.js            the rules: plan, placement, suggestions, wear, sizes, care,
                      checking the model's answers (no DOM, tested)
js/ai.js              the only file that talks to the network
js/store.js           IndexedDB for pairs, localStorage for settings
js/image.js           shrinks photos; cuts a pair out of a rack photo
js/ui.js              icons, toast, confirm dialog
sw.js                 offline cache for the app itself
test/                 node --test
```
