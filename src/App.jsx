import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "./strings.js";
import { IosInstallSheet, showIosInstall } from "./IosInstall.jsx";

/* ---------- small helpers ---------- */

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("amaculo:" + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("amaculo:" + key, JSON.stringify(value));
    } catch {}
  },
};

function usePersisted(key, initial) {
  const [v, setV] = useState(() => store.get(key, initial));
  useEffect(() => store.set(key, v), [key, v]);
  return [v, setV];
}

function useHashRoute() {
  const read = () => (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return parts;
}
const go = (path) => (location.hash = "#/" + path);

const fold = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ");

/* ---------- icons ---------- */

const Icon = {
  cover: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 7v8M9 10h6" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  ),
  ribbon: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10v18l-5-4-5 4z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  ),
  type: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 19 8 6l5 13M5 14.5h6M14.5 19l3-7.5 3 7.5M15.6 16.6h3.8" />
    </svg>
  ),
};

/* ---------- app ---------- */

export default function App() {
  const route = useHashRoute();
  const [data, setData] = useState(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [error, setError] = useState(false);
  const [favs, setFavs] = usePersisted("favs", []);
  const [last, setLast] = usePersisted("last", null);
  const [size, setSize] = usePersisted("size", 21);
  const [theme, setTheme] = usePersisted(
    "theme",
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day"
  );

  useEffect(() => {
    fetch("/hymns.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#2a1b14");
  }, [theme]);

  const hymns = data?.hymns ?? [];
  const byNumber = useMemo(() => new Map(hymns.map((h) => [h.number, h])), [hymns]);

  const toggleFav = (n) => setFavs((f) => (f.includes(n) ? f.filter((x) => x !== n) : [...f, n].sort((a, b) => a - b)));

  const [view, arg] = route;
  let screen;
  let tab = "home";
  if (view === "iculo" && arg) {
    tab = "index";
    const h = byNumber.get(+arg);
    screen = data ? (
      h ? (
        <Reader
          key={h.number}
          hymn={h}
          hymns={hymns}
          fav={favs.includes(h.number)}
          onFav={() => toggleFav(h.number)}
          size={size}
          setSize={setSize}
          theme={theme}
          setTheme={setTheme}
          onRead={() => setLast(h.number)}
        />
      ) : (
        <Page title={t.hymn + " " + arg} back>
          <p className="empty">{t.openMissing(arg)}</p>
        </Page>
      )
    ) : null;
  } else if (view === "amaculo") {
    tab = "index";
    screen = <IndexScreen hymns={hymns} />;
  } else if (view === "khangela") {
    tab = "search";
    screen = <SearchScreen hymns={hymns} />;
  } else if (view === "ezithandwayo") {
    tab = "saved";
    screen = <SavedScreen hymns={favs.map((n) => byNumber.get(n)).filter(Boolean)} />;
  } else {
    screen = <Cover hymns={hymns} byNumber={byNumber} last={last ? byNumber.get(last) : null} onInstall={() => setInstallOpen(true)} />;
  }

  return (
    <div className="desk">
      <div className={"book" + (tab === "home" ? " book--cover" : "")}>
        <div className="screen" key={route.join("/")}>
          {error ? <p className="empty">Could not load hymns.json</p> : screen}
        </div>
        <TabBar tab={tab} />
        <IosInstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
      </div>
    </div>
  );
}

/* ---------- chrome ---------- */

function TabBar({ tab }) {
  const items = [
    ["home", "", t.tabHome, Icon.cover],
    ["index", "amaculo", t.tabIndex, Icon.list],
    ["search", "khangela", t.tabSearch, Icon.search],
    ["saved", "ezithandwayo", t.tabSaved, Icon.ribbon],
  ];
  return (
    <nav className="tabbar" aria-label="Main">
      {items.map(([id, path, label, icon]) => (
        <a key={id} href={"#/" + path} className="tab" aria-current={tab === id ? "page" : undefined}>
          {icon}
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

function Page({ title, sub, back, actions, children }) {
  return (
    <div className="page">
      <header className="runhead">
        {back ? (
          <button className="iconbtn" onClick={() => (history.length > 1 ? history.back() : go("amaculo"))} aria-label={t.back}>
            {Icon.back}
          </button>
        ) : (
          <span className="iconbtn-space" />
        )}
        <div className="runhead__title">
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        <div className="runhead__actions">{actions ?? <span className="iconbtn-space" />}</div>
      </header>
      {children}
    </div>
  );
}

/* ---------- cover / home ---------- */

function Cover({ hymns, byNumber, last, onInstall }) {
  const [num, setNum] = useState("");
  const [msg, setMsg] = useState("");
  const open = (e) => {
    e.preventDefault();
    const n = parseInt(num, 10);
    if (!n) return;
    if (byNumber.has(n)) go("iculo/" + n);
    else setMsg(t.openMissing(n));
  };
  return (
    <div className="cover">
      <div className="cover__frame">
        <svg className="cover__cross" viewBox="0 0 40 60" aria-hidden="true">
          <path d="M17 2h6v16h15v6H23v34h-6V24H2v-6h15z" />
        </svg>
        <h1 className="cover__title">{t.appTitle}</h1>
        <p className="cover__sub">{t.coverLine}</p>

        <form className="opener" onSubmit={open}>
          <label htmlFor="num">{t.openLabel}</label>
          <div className="opener__row">
            <input
              id="num"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={4}
              value={num}
              placeholder={hymns.length ? "1–" + hymns[hymns.length - 1].number : "1"}
              onChange={(e) => {
                setNum(e.target.value.replace(/\D/g, ""));
                setMsg("");
              }}
            />
            <button type="submit">{t.openButton}</button>
          </div>
          <p className="opener__msg" role="status">
            {msg || (hymns.length === 0 ? t.noHymns : "")}
          </p>
        </form>

        {showIosInstall && (
          <button className="cover__install" onClick={onInstall}>
            {t.iosCoverLink}
          </button>
        )}
        <p className="cover__brand">{t.appSub}</p>
      </div>

      {last && (
        <a className="ribbon" href={"#/iculo/" + last.number} aria-label={`${t.continueReading}: ${t.hymn} ${last.number}, ${last.title}`}>
          <span className="ribbon__text">
            <small>{t.continueReading}</small>
            <b>{last.number}</b>
          </span>
        </a>
      )}
    </div>
  );
}

/* ---------- lists ---------- */

function HymnRow({ h, snippet }) {
  return (
    <li>
      <a className="row" href={"#/iculo/" + h.number}>
        <span className="row__n">{h.number}</span>
        <span className="row__body">
          <span className="row__title">{h.title}</span>
          <span className="row__first">{snippet ?? h.firstLine}</span>
        </span>
      </a>
    </li>
  );
}

function IndexScreen({ hymns }) {
  const listRef = useRef(null);
  const max = hymns.length ? hymns[hymns.length - 1].number : 0;
  const step = max > 400 ? 100 : 50;
  const tabs = [];
  if (hymns.length > 30) for (let s = 1; s <= max; s += step) if (hymns.some((h) => h.number >= s && h.number < s + step)) tabs.push(s);

  useLayoutEffect(() => {
    const y = store.get("indexScroll", 0);
    const sc = listRef.current?.closest(".screen");
    if (sc) sc.scrollTop = y;
    return () => sc && store.set("indexScroll", sc.scrollTop);
  }, []);

  const jump = (s) => {
    const el = listRef.current?.querySelector(`[data-from="${s}"]`);
    el?.scrollIntoView({ block: "start" });
  };

  return (
    <Page title={t.tabIndex} sub={t.indexSub}>
      {hymns.length === 0 && <p className="empty">{t.noHymns}</p>}
      <ol className="list" ref={listRef}>
        {hymns.map((h, i) => {
          const s = tabs.find((x) => h.number >= x && h.number < x + step);
          const firstOfRange = s && (i === 0 || hymns[i - 1].number < s);
          return (
            <React.Fragment key={h.number}>
              {firstOfRange && <li className="list__anchor" data-from={s} aria-hidden="true" />}
              <HymnRow h={h} />
            </React.Fragment>
          );
        })}
      </ol>
      {tabs.length > 1 && (
        <nav className="thumbs" aria-label="Jump to hymn number">
          {tabs.map((s) => (
            <button key={s} onClick={() => jump(s)} aria-label={`${t.hymn} ${s}`}>
              {s}
            </button>
          ))}
        </nav>
      )}
    </Page>
  );
}

// Same folding as fold(), but one output character per input character so match positions line up.
const foldSameLength = (s) =>
  [...s].map((c) => {
    const b = c.normalize("NFD")[0].toLowerCase();
    return /[’‘`]/.test(b) ? "'" : /[a-z0-9' ]/.test(b) ? b : " ";
  });

function Highlight({ text, terms }) {
  if (!terms.length) return text;
  const chars = [...text];
  const f = foldSameLength(text).join("");
  text = chars;
  const marks = new Array(text.length).fill(false);
  for (const term of terms) {
    let i = f.indexOf(term);
    while (i !== -1) {
      for (let k = i; k < i + term.length; k++) marks[k] = true;
      i = f.indexOf(term, i + 1);
    }
  }
  const out = [];
  let buf = "";
  let on = marks[0];
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== on) {
      out.push(on ? <mark key={i}>{buf}</mark> : buf);
      buf = "";
      on = marks[i];
    }
    buf += text[i];
  }
  out.push(on ? <mark key="end">{buf}</mark> : buf);
  return out;
}

function SearchScreen({ hymns }) {
  const [q, setQ] = usePersisted("query", "");
  const index = useMemo(
    () => hymns.map((h) => ({ h, lines: h.stanzas.flatMap((s) => s.lines), all: fold(h.title + " " + h.stanzas.map((s) => s.lines.join(" ")).join(" ")) })),
    [hymns]
  );
  const query = q.trim();
  const isNum = /^\d+$/.test(query);
  const terms = isNum ? [] : fold(query).split(/\s+/).filter(Boolean);

  let results = [];
  if (isNum) {
    results = index.filter(({ h }) => String(h.number).startsWith(query)).sort((a, b) => (a.h.number === +query ? -1 : b.h.number === +query ? 1 : 0));
  } else if (terms.length) {
    results = index.filter((x) => terms.every((term) => x.all.includes(term)));
  }

  return (
    <Page title={t.tabSearch}>
      <div className="searchbox">
        {Icon.search}
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.tabSearch}
          enterKeyHint="search"
        />
        {q && (
          <button className="searchbox__clear" onClick={() => setQ("")} aria-label={t.clear}>
            ×
          </button>
        )}
      </div>
      {!query && <p className="empty">{t.searchHelp}</p>}
      {query && results.length === 0 && <p className="empty">{t.searchNone(query)}</p>}
      <ol className="list">
        {results.slice(0, 200).map(({ h, lines }) => {
          let snippet;
          if (terms.length) {
            const line = lines.find((l) => fold(l).includes(terms[0])) ?? h.firstLine;
            snippet = <Highlight text={line} terms={terms} />;
          }
          return <HymnRow key={h.number} h={terms.length ? { ...h, title: <Highlight text={h.title} terms={terms} /> } : h} snippet={snippet} />;
        })}
      </ol>
    </Page>
  );
}

function SavedScreen({ hymns }) {
  return (
    <Page title={t.tabSaved}>
      {hymns.length === 0 ? (
        <div className="empty empty--saved">
          <span className="empty__ribbon" aria-hidden="true" />
          <p>{t.savedEmpty}</p>
        </div>
      ) : (
        <ol className="list">
          {hymns.map((h) => (
            <HymnRow key={h.number} h={h} />
          ))}
        </ol>
      )}
    </Page>
  );
}

/* ---------- reader ---------- */

function Reader({ hymn, hymns, fav, onFav, size, setSize, theme, setTheme, onRead }) {
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState({});
  const i = hymns.indexOf(hymn);
  const prev = hymns[i - 1];
  const next = hymns[i + 1];
  const touch = useRef(null);

  useEffect(() => {
    onRead();
    document.title = `${hymn.number}. ${hymn.title} | Amaculo`;
    return () => (document.title = "XhosaHymns");
  }, [hymn.number]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowRight" && next) go("iculo/" + next.number);
      if (e.key === "ArrowLeft" && prev) go("iculo/" + prev.number);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [prev, next]);

  const onTouchStart = (e) => (touch.current = [e.touches[0].clientX, e.touches[0].clientY]);
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current[0];
    const dy = e.changedTouches[0].clientY - touch.current[1];
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
      if (dx < 0 && next) go("iculo/" + next.number);
      if (dx > 0 && prev) go("iculo/" + prev.number);
    }
  };

  return (
    <Page
      title={`${t.hymn} ${hymn.number}`}
      back
      actions={
        <>
          <button className="iconbtn" onClick={() => setSheet(true)} aria-label={t.textSettings}>
            {Icon.type}
          </button>
          <button className={"iconbtn fav" + (fav ? " fav--on" : "")} onClick={onFav} aria-pressed={fav} aria-label={fav ? t.unsave : t.save}>
            {Icon.ribbon}
          </button>
        </>
      }
    >
      <article className="hymn" style={{ "--size": size + "px" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="hymn__head">
          <span className="hymn__num">{hymn.number}</span>
          <h2 className="hymn__title">{hymn.title}</h2>
          {hymn.ref && <p className="hymn__ref">{hymn.ref}</p>}
          <span className="fleuron" aria-hidden="true">❦</span>
        </div>

        {hymn.stanzas.map((s, k) =>
          s.type === "chorus" && s.repeat && !open[k] ? (
            <button key={k} className="stanza stanza--repeat" onClick={() => setOpen((o) => ({ ...o, [k]: true }))}>
              {t.chorusRepeat}
            </button>
          ) : (
            <section key={k} className={"stanza stanza--" + s.type}>
              <span className="stanza__mark">{s.type === "verse" ? s.n : t.chorus}</span>
              <p>
                {s.lines.map((l, j) => (
                  <span className={"line" + (s.en?.includes(j) ? " line--en" : "")} key={j}>
                    {l}
                  </span>
                ))}
              </p>
            </section>
          )
        )}

        <nav className="turn">
          {prev ? (
            <a href={"#/iculo/" + prev.number} aria-label={t.prev}>
              <small>‹ {prev.number}</small>
              <span>{prev.title}</span>
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a href={"#/iculo/" + next.number} className="turn__next" aria-label={t.next}>
              <small>{next.number} ›</small>
              <span>{next.title}</span>
            </a>
          ) : (
            <span />
          )}
        </nav>
      </article>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-label={t.textSettings} onClick={(e) => e.stopPropagation()}>
            <h3>{t.textSettings}</h3>
            <div className="sizer">
              <button onClick={() => setSize((s) => Math.max(16, s - 2))} aria-label={t.smaller}>
                A
              </button>
              <input type="range" min="16" max="34" step="1" value={size} onChange={(e) => setSize(+e.target.value)} aria-label={t.textSettings} />
              <button className="big" onClick={() => setSize((s) => Math.min(34, s + 2))} aria-label={t.larger}>
                A
              </button>
            </div>
            <div className="seg" role="radiogroup">
              {[
                ["day", t.day],
                ["night", t.night],
              ].map(([id, label]) => (
                <button key={id} role="radio" aria-checked={theme === id} onClick={() => setTheme(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button className="sheet__close" onClick={() => setSheet(false)}>
              {t.close}
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}
