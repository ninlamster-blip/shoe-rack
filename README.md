# Shoe Rack

A phone app for keeping the family shoe rack in order. Photograph a pair, and
Claude works out what it is. The app tells you which shelf it belongs on. Point
the camera at a shelf later, and it tells you which pairs have wandered.

It's an installable web app: open it in the phone's browser, then use
**Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android).

## How it's organised

The rack is sorted **by type**. Every type gets one shelf:

| Shelf | Type |
|---|---|
| 1 | Sneakers |
| 2 | Formal |
| 3 | Sandals |
| 4 | Boots |
| 5 | Sports |
| 6 | Slippers |
| 7 | Heels |
| 8 | Other |

You can reorder the shelves in **Settings → Shelf order**, and every pair
follows its type, because no pair stores a shelf number of its own. Within a
shelf, daily pairs go at the front, then pairs are grouped by person in the
order your family is listed. Open a shelf to see the exact left-to-right order.

## Screens

- **Rack**: every shelf as a coloured pill, with its pairs. Filter by person.
- **+ (Add New Pair)**: take a photo. Claude fills in the type, colour, name and
  brand, and the app shows which shelf the pair goes on. Anything you pick
  yourself is never overwritten.
- **Check**: choose a shelf and photograph it. You get a list of pairs that
  belong and pairs to move, each with the shelf it should go to.
- **Family**: who owns shoes on the rack.
- **Settings**: API key, shelf order, backup and restore, erase.

## The API key, and what leaves the phone

Recognition uses Claude through Anthropic's API, so it needs your own API key.
Get one at console.anthropic.com and paste it into Settings.

- The key is kept in this browser's storage on this phone, and sent only to
  `api.anthropic.com`.
- Each recognition sends **one photo** (shrunk to about 1024px) and a fixed
  instruction. Family names, the rest of the rack and other photos are never
  sent. `test/ai.test.mjs` checks this against the built request.
- Each photo costs roughly one or two US cents.
- Without a key, or offline, everything still works. You choose the type
  yourself; it's one tap.

A key kept in the browser is fine for one family phone. **Don't host this
publicly with your key in it.** If the app is ever shared beyond your household,
put a small server (such as a Cloudflare Worker) between the app and Anthropic
so the key lives there instead.

Everything else — pairs, photos, family, settings — stays on the phone
(IndexedDB and localStorage). **Settings → Save a backup** writes it all,
photos included, to one file you can restore later.

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
js/app.js             screens and routing
js/rack.js            the rack's rules: shelves, sorting, checking the model's answers (no DOM, tested)
js/ai.js              the only file that talks to the network
js/store.js           IndexedDB for pairs, localStorage for settings
js/image.js           shrinks a camera photo before storing or sending it
js/ui.js              icons, toast, confirm dialog
sw.js                 offline cache for the app itself
test/                 node --test
```
