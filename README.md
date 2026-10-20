# XhosaHymns — Amaculo

A phone-first hymn book for Xhosa hymns, designed to look like a leather-bound Bible.
Hymns come from PowerPoint (`.pptx`) files you put in the `hymns/` folder.

## Adding hymns

1. Name each file with the hymn number first, then the title:
   `001 Nkosi Sikelel' iAfrika.pptx`, `023 Bawo Wethu.pptx`
2. Put it in the `hymns/` folder.
3. Deploy (push to GitHub, or run `npx vercel --prod`). The app rebuilds and the hymn appears.

How a slide deck is read:

| In the deck | In the app |
|---|---|
| Each slide | One verse, numbered in red |
| A slide that starts with **Ikhorasi**, **Chorus** or **Refrain** | The chorus (the label is removed) |
| A slide repeated later in the deck | Shown once, then "Phinda ikhorasi" (tap to expand) |
| A first slide with only the title, or "45" + title | Skipped (used as the title/number) |
| "1." or "2)" at the start of a verse | Removed (the app numbers verses itself) |

If a file has no number, it's given the next free number, and duplicate numbers are renumbered with a warning in the build log.
Both `.pptx` and old PowerPoint 97–2003 `.ppt` files are read. A short letter prefix on the number is fine (`X068 Ngemini yeCawa.ppt` → hymn 68), and a heading line such as "XHOSA 68" at the top of the first slide is skipped. In bilingual hymns, English translation lines are shown in lighter italics.

The two sample hymns in `hymns/` (Nkosi Sikelel' iAfrika, Ulo Thixo Omkhulu) are only there for testing. Delete them when you add your own.

## Deploying to Vercel

### Option A: GitHub + Vercel (recommended, no installs needed)
1. On github.com, create a new repository called `XhosaHymns`.
2. Click **uploading an existing file** and drag in everything from this folder **except** `node_modules` and `dist` (if present).
3. On vercel.com, click **Add New… → Project**, import the `XhosaHymns` repo, and click **Deploy**. Vercel reads `vercel.json`, so no settings need changing.
4. To add hymns later, open the `hymns` folder on GitHub, click **Add file → Upload files**, and drop in the `.pptx` files. Vercel redeploys automatically in about a minute.

### Option B: Vercel CLI from this folder
Requires [Node.js 18+](https://nodejs.org).
```bash
npm install
npx vercel          # first time: log in and link the project
npx vercel --prod   # publish
```

## Installing on phones
- **iPhone / iPad:** open the site in Safari, tap Share, then **Add to Home Screen**. The app opens full-screen with a leather launch screen, and works offline. iPhone users see a short guide for this once, and the cover has a link to show it again. (Code: `src/IosInstall.jsx`, launch screens in `public/splash/`.) None of this appears on Android.
- **Android:** Chrome, Samsung Internet and Edge users get an **install button** on the cover and a one-time prompt. One tap opens Android's own install dialog (with screenshots and a description from `manifest.webmanifest`). Other browsers get short steps (⋮ → Install app). Once installed, long-pressing the Amaculo icon offers shortcuts: continue reading, search, all hymns, favourites. (Code: `src/AndroidInstall.jsx`.) None of this appears on iPhone.
- **Preview either prompt on any device:** add `?ios-preview` or `?android-preview` to the address.

## Running locally
```bash
npm install
npm run dev        # http://localhost:5173
```

> This folder is inside OneDrive. `npm install` creates a large `node_modules` folder that OneDrive will try to sync. With Option A you never need to run npm here.

## Changing the wording
All interface text is in `src/strings.js`. Correct the Xhosa there, and nothing else needs to change.

## What's inside
- `scripts/build-hymns.mjs`: turns `hymns/*.pptx` into `public/hymns.json` (runs before every dev/build)
- `src/App.jsx`: screens (cover, hymn list with thumb index, reader, search, favourites)
- `src/styles.css`: the Bible look (leather, gilt, India paper, red verse numbers)
- `public/sw.js` + `manifest.webmanifest`: installable on phones ("Add to Home Screen") and works offline after the first visit
