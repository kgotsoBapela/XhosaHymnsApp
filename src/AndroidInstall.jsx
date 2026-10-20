// Android only: one-tap install through the browser's own install dialog.
// Chrome, Samsung Internet and Edge fire `beforeinstallprompt` when the app can be installed;
// we keep that event and replay it when the person taps our button.
// Browsers without it (Firefox, in-app browsers) get short manual steps instead.
// Nothing here renders on iPhone/iPad or on computers.
import React, { useEffect, useState } from "react";
import { t } from "./strings.js";
import { isIOS, isStandalone } from "./IosInstall.jsx";

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const preview = typeof location !== "undefined" && /[?&]android-preview\b/.test(location.search);
export const isAndroid = (/Android/i.test(ua) && !isIOS) || preview;
// Facebook, Instagram etc. and plain Android web views can't install apps
const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|; wv\)/.test(ua);

/* ---- keep the browser's install event (it can fire before React has mounted) ---- */
let deferred = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined" && isAndroid) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of Chrome's mini bar
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function useAndroidInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return {
    show: isAndroid && !isStandalone && !installed,
    canPrompt: !!deferred,
    async install() {
      if (!deferred) return "unavailable";
      const e = deferred;
      deferred = null; // the event can only be used once
      notify();
      e.prompt();
      const { outcome } = await e.userChoice;
      return outcome; // "accepted" | "dismissed"
    },
  };
}

const KEY = "amaculo:androidHintSeen";
const seen = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
};

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="19" r="1.6" />
  </svg>
);
const InstallIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7.5v7M9 11.5l3 3 3-3" />
  </svg>
);

/** One-time prompt a few seconds after the first visit; `open`/`onClose` let the cover button reopen it. */
export function AndroidInstallSheet({ open, onClose }) {
  const { show, canPrompt, install } = useAndroidInstall();
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!show || (seen() && !preview)) return;
    const id = setTimeout(() => setAuto(true), preview ? 600 : 4000);
    return () => clearTimeout(id);
  }, [show]);

  if (!show || !(open || auto)) return null;

  const close = () => {
    if (!preview) markSeen();
    setAuto(false);
    onClose?.();
  };

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet ios-install" role="dialog" aria-labelledby="android-install-title" onClick={(e) => e.stopPropagation()}>
        <img className="ios-install__icon android-install__icon" src="/icon-maskable-192.png" alt="" width="64" height="64" />
        <h3 id="android-install-title">{t.androidTitle}</h3>
        <p className="ios-install__lead">{t.androidLead}</p>

        {inAppBrowser ? (
          <p className="ios-install__note">{t.androidInApp}</p>
        ) : canPrompt ? (
          <button
            className="install-cta"
            onClick={async () => {
              await install();
              close();
            }}
          >
            {t.androidInstall}
          </button>
        ) : (
          <ol className="ios-install__steps">
            <li>
              <span className="ios-install__glyph android-install__glyph">
                <MenuIcon />
              </span>
              <span>{t.androidStep1}</span>
            </li>
            <li>
              <span className="ios-install__glyph android-install__glyph">
                <InstallIcon />
              </span>
              <span>
                {t.androidStep2a} <b>Install app</b> {t.androidStep2or} <b>Add to Home screen</b>
                {t.androidStep2b}
              </span>
            </li>
            <li>
              <span className="ios-install__glyph android-install__glyph ios-install__glyph--text">Install</span>
              <span>
                {t.androidStep3a} <b>Install</b>
                {t.androidStep3b}
              </span>
            </li>
          </ol>
        )}

        <button className="sheet__close" onClick={close}>
          {canPrompt && !inAppBrowser ? t.androidLater : t.iosDone}
        </button>
      </div>
    </div>
  );
}
