// Reads every .pptx in /hymns and writes public/hymns.json.
// Runs automatically before `npm run dev` and `npm run build` (and therefore on Vercel).
//
// File name convention:  "023 Bawo Wethu.pptx"  ->  hymn 23, title "Bawo Wethu"
// Each slide = one verse. A slide starting with "Ikhorasi" / "Chorus" / "Refrain",
// or a slide that repeats an earlier one, is treated as the chorus.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

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

async function parseDeck(file) {
  const base = path.basename(file).replace(/\.pptx$/i, "");
  const m = base.match(/^\s*(\d+)[\s._\-–]*(.*)$/);
  let number = m ? parseInt(m[1], 10) : null;
  let title = (m ? m[2] : base).replace(/[_]+/g, " ").trim();

  const zip = await JSZip.loadAsync(await fs.readFile(file));
  let slides = [];
  for (const p of await slideOrder(zip)) {
    const lines = slideLines(await zip.file(p).async("string"));
    if (lines.length) slides.push(lines);
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

  const firstVerse = stanzas.find((s) => !s.repeat);
  return {
    number,
    title: title || "Iculo",
    firstLine: firstVerse ? firstVerse.lines[0] : "",
    stanzas,
    file: path.basename(file),
  };
}

async function main() {
  await fs.mkdir(HYMN_DIR, { recursive: true });
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const files = (await fs.readdir(HYMN_DIR)).filter((f) => /\.pptx$/i.test(f) && !f.startsWith("~$"));
  const skipped = (await fs.readdir(HYMN_DIR)).filter((f) => /\.ppt$/i.test(f));
  if (skipped.length) console.warn(`⚠  Skipped old .ppt files (save them as .pptx): ${skipped.join(", ")}`);

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
