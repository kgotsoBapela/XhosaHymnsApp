// Reads every .pptx and .ppt in /hymns and writes public/hymns.json.
// Runs automatically before `npm run dev` and `npm run build` (and therefore on Vercel).
//
// File name convention:  "023 Bawo Wethu.pptx"  ->  hymn 23, title "Bawo Wethu"
//                         "X068 Ngemini yeCawa.ppt" -> hymn 68 (a short letter prefix is ignored)
// A first line such as "XHOSA 68" or "Iculo 68" is treated as a heading, not part of the verse.
// Each slide = one verse. A slide starting with "Ikhorasi" / "Chorus" / "Refrain",
// or a slide that repeats an earlier one, is treated as the chorus.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import CFB from "cfb";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HYMN_DIR = path.join(root, "hymns");
const OUT = path.join(root, "public", "hymns.json");

const CHORUS_RE = /^\s*(ikhorasi|ikorasi|khorasi|chorus|refrain|ref\.?)\s*[:.\-–]?\s*/i;
const VERSE_NUM_RE = /^\s*(\d{1,2})\s*[.):]\s+|^\s*(\d{1,2})\s*$/;

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

async function slideOrder(zip) {
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  if (pres && rels) {
    const map = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = m[0].match(/Id="([^"]+)"/)?.[1];
      const target = m[0].match(/Target="([^"]+)"/)?.[1];
      if (id && target && /slides\/slide\d+\.xml$/.test(target)) {
        map[id] = "ppt/" + target.replace(/^\/?ppt\//, "").replace(/^\.\.\//, "");
      }
    }
    const ids = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
    const ordered = ids.map((id) => map[id]).filter((p) => p && zip.file(p));
    if (ordered.length) return ordered;
  }
  // Fallback: numeric order of slide files
  return Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
}

function slideLines(xml) {
  const lines = [];
  for (const p of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    let text = "";
    for (const t of p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) {
      text += t[1] !== undefined ? decode(t[1]) : "\n";
    }
    for (const line of text.split("\n")) {
      const clean = line.replace(/\s+/g, " ").trim();
      if (clean) lines.push(clean);
    }
  }
  return lines;
}

// Spacing fixes: "phela,Umyali" -> "phela, Umyali" and "kuYesu ," -> "kuYesu,"
const tidy = (l) =>
  l
    .replace(/([,;:])(?=[^\s\d"'’”)])/g, "$1 ")
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const toLines = (texts) =>
  texts
    .flatMap((t) => t.split(/[\r\n\u000b]/))
    .map(tidy)
    .filter(Boolean);

// Old PowerPoint 97-2003 (.ppt): text lives in binary records inside the "PowerPoint Document" stream.
function readPpt(buf) {
  const cfb = CFB.read(buf, { type: "buffer" });
  const entry = CFB.find(cfb, "PowerPoint Document");
  if (!entry) throw new Error("not a PowerPoint file");
  const b = Buffer.from(entry.content);
  const fromList = []; // placeholder text, one group per slide (SlideListWithText)
  const fromShapes = []; // free text boxes drawn on each slide

  function walk(off, end, ctx) {
    while (off + 8 <= end) {
      const vi = b.readUInt16LE(off);
      const type = b.readUInt16LE(off + 2);
      const len = b.readUInt32LE(off + 4);
      const body = off + 8;
      const next = body + len;
      if (next > end) break;
      if (type === 0x03f3 && ctx.list) fromList.push([]); // SlidePersistAtom: next slide starts
      else if (type === 0x0fa0 || type === 0x0fa8) {
        const txt = type === 0x0fa0 ? b.toString("utf16le", body, next) : b.toString("latin1", body, next);
        if (ctx.list && fromList.length) fromList.at(-1).push(txt);
        else if (ctx.slide && fromShapes.length) fromShapes.at(-1).push(txt);
      }
      if ((vi & 0xf) === 0xf) {
        const c = { ...ctx };
        if (type === 0x0ff0) c.list = vi >> 4 === 0; // instance 0 = slides (not masters/notes)
        if (type === 0x03ee) {
          c.slide = true;
          fromShapes.push([]);
        }
        if (type === 0x03f8 || type === 0x03f0) c.list = c.slide = false; // masters, notes
        walk(body, next, c);
      }
      off = next;
    }
  }
  walk(0, b.length, {});

  const list = fromList.map(toLines);
  const shapes = fromShapes.map(toLines);
  if (list.length === shapes.length) {
    return list.map((l, i) => [...l, ...shapes[i].filter((x) => !l.includes(x))]).filter((l) => l.length);
  }
  const best = list.flat().length >= shapes.flat().length ? list : shapes;
  return best.filter((l) => l.length);
}

async function readPptx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const slides = [];
  for (const p of await slideOrder(zip)) {
    const lines = slideLines(await zip.file(p).async("string"));
    if (lines.length) slides.push(lines);
  }
  return slides;
}

// A line is taken as English when it has at least two common English words
const EN_WORDS = new Set(
  "the a an and of to for in on at by with my your you me we us our he his him she her they them it is are was were be will shall must all this that who what when where how love lord god jesus christ grace holy spirit not no from as so let i".split(" ")
);
const words = (line) => line.toLowerCase().split(/[^a-z’']+/).filter(Boolean);
const isEnglish = (line) => words(line).filter((w) => EN_WORDS.has(w)).length >= 2;
// Within a clearly bilingual hymn, also catch short English lines: Xhosa words nearly always
// end in a vowel (or -m, as in yam/wam), English words often end in other consonants.
const looksEnglish = (line) => {
  const w = words(line).map((x) => x.replace(/[’']/g, "")).filter((x) => x !== "amen");
  if (!w.length) return false;
  const consonantEnd = w.filter((x) => /[b-df-hj-lnp-tv-z]$/.test(x)).length / w.length;
  const stop = w.filter((x) => EN_WORDS.has(x)).length;
  return stop >= 2 || (stop >= 1 && consonantEnd >= 0.3) || consonantEnd >= 0.6;
};

const HEADING_RE = /^(?:isixhosa|xhosa|iculo|hymn|ingoma|h\s*&\s*p|no\.?)?\s*#?\s*(\d{1,4})\.?$/i;

async function parseDeck(file) {
  const base = path.basename(file).replace(/\.pptx?$/i, "");
  const m = base.match(/^\s*(?:[A-Za-z]{1,3}[-_]?)?(\d+)[\s._\-–]*(.*)$/);
  let number = m ? parseInt(m[1], 10) : null;
  let title = tidy((m ? m[2] : base).replace(/[_]+/g, " "));

  const buf = await fs.readFile(file);
  let slides = /\.ppt$/i.test(file) ? readPpt(buf) : await readPptx(buf);

  // A heading line like "XHOSA 68" at the top of the first slide
  if (slides[0] && slides[0].length > 1) {
    const h = slides[0][0].match(HEADING_RE);
    if (h) {
      if (number == null) number = parseInt(h[1], 10);
      slides[0] = slides[0].slice(1);
    }
  }

  // Drop a title slide that just repeats the hymn title / number
  if (slides.length > 1) {
    const first = slides[0];
    const joined = norm(first.join(" "));
    const t = norm(title);
    const numLine = first[0].match(/^(?:iculo|hymn|no\.?)?\s*(\d{1,4})\s*$/i);
    if (first.length <= 3 && t && (joined.includes(t) || t.includes(joined))) {
      if (!title) title = first[0];
      slides = slides.slice(1);
    } else if (numLine && first.length <= 3) {
      // e.g. a first slide reading "45" / "Bawo Wethu"
      if (number == null) number = parseInt(numLine[1], 10);
      if (first[1]) title = first[1];
      slides = slides.slice(1);
    }
  }
  if (!title && slides[0]) title = slides[0][0].replace(VERSE_NUM_RE, "");

  const stanzas = [];
  const seen = new Map();
  let verse = 0;
  for (let lines of slides) {
    lines = [...lines];
    let type = "verse";
    if (CHORUS_RE.test(lines[0])) {
      type = "chorus";
      lines[0] = lines[0].replace(CHORUS_RE, "").trim();
      if (!lines[0]) lines.shift();
    } else {
      lines[0] = lines[0].replace(VERSE_NUM_RE, "").trim();
      if (!lines[0]) lines.shift();
    }
    if (!lines.length) continue;
    const key = norm(lines.join(" "));
    if (seen.has(key)) {
      // A repeated slide is a chorus repeat; mark the original as chorus too.
      const orig = stanzas[seen.get(key)];
      if (orig.type === "verse") {
        orig.type = "chorus";
        delete orig.n;
      }
      stanzas.push({ type: "chorus", repeat: true, lines });
      continue;
    }
    seen.set(key, stanzas.length);
    stanzas.push(type === "verse" ? { type, n: 0, lines } : { type, lines });
  }
  // Number the verses after chorus detection
  for (const s of stanzas) if (s.type === "verse") s.n = ++verse;

  // Mark English translation lines in bilingual hymns so the app can set them apart
  const bilingual = stanzas.flatMap((s) => s.lines).filter(isEnglish).length >= 3;
  const test = bilingual ? looksEnglish : isEnglish;
  for (const s of stanzas) {
    const en = s.lines.map((l, i) => (test(l) ? i : -1)).filter((i) => i >= 0);
    if (en.length && en.length < s.lines.length) s.en = en;
  }

  // A hymn-book cross reference at the end of the title, e.g. "H&P535"
  let ref;
  const r = title.match(/\s+(H\s*&\s*P|MHB|HAM)\s*(\d+)\s*$/i);
  if (r) {
    ref = `${r[1].replace(/\s+/g, "").toUpperCase()} ${r[2]}`;
    title = title.slice(0, r.index).trim();
  }

  const firstVerse = stanzas.find((s) => !s.repeat);
  return {
    number,
    title: title || "Iculo",
    ...(ref ? { ref } : {}),
    firstLine: firstVerse ? firstVerse.lines[0] : "",
    stanzas,
    file: path.basename(file),
  };
}

async function main() {
  await fs.mkdir(HYMN_DIR, { recursive: true });
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const files = (await fs.readdir(HYMN_DIR)).filter((f) => /\.pptx?$/i.test(f) && !f.startsWith("~$"));

  const hymns = [];
  for (const f of files) {
    try {
      hymns.push(await parseDeck(path.join(HYMN_DIR, f)));
    } catch (e) {
      console.warn(`⚠  Could not read ${f}: ${e.message}`);
    }
  }

  // Number hymns without a number after the highest numbered one
  let next = Math.max(0, ...hymns.map((h) => h.number || 0));
  hymns.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title));
  const used = new Set();
  for (const h of hymns) {
    if (h.number == null || used.has(h.number)) {
      if (h.number != null) console.warn(`⚠  Duplicate number ${h.number} in ${h.file}; renumbered.`);
      h.number = ++next;
    }
    used.add(h.number);
  }
  hymns.sort((a, b) => a.number - b.number);

  await fs.writeFile(OUT, JSON.stringify({ count: hymns.length, built: new Date().toISOString(), hymns }));
  console.log(`✓ ${hymns.length} hymn(s) written to public/hymns.json`);
}

main();
