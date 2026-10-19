// iPhone / iPad only: a short guide for "Add to Home Screen".
// Safari never offers to install a web app by itself, so iOS users need to be shown how.
// Nothing here renders on Android or desktop.
import React, { useEffect, useState } from "react";
import { t } from "./strings.js";

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
export const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone =
  typeof window !== "undefined" &&
  (window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches);
// Browsers inside other apps (Facebook, Instagram…) can't add to the home screen
const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|GSA\//.test(ua);

export const showIosInstall = isIOS && !isStandalone;

const KEY = "amaculo:iosHintSeen";
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

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17" />
  </svg>
);
const MoreIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);
const AddIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);

/** Opens itself once, a few seconds after the first visit; `open`/`onClose` let the cover link reopen it. */
export function IosInstallSheet({ open, onClose }) {
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!showIosInstall || seen()) return;
    const id = setTimeout(() => setAuto(true), 4000);
    return () => clearTimeout(id);
  }, []);

  if (!showIosInstall || !(open || auto)) return null;

  const close = () => {
    markSeen();
    setAuto(false);
    onClose?.();
  };

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet ios-install" role="dialog" aria-labelledby="ios-install-title" onClick={(e) => e.stopPropagation()}>
        <img className="ios-install__icon" src="/icon-180.png" alt="" width="64" height="64" />
        <h3 id="ios-install-title">{t.iosTitle}</h3>
        <p className="ios-install__lead">{t.iosLead}</p>

        {inAppBrowser ? (
          <p className="ios-install__note">{t.iosInApp}</p>
        ) : (
          <ol className="ios-install__steps">
            <li>
              <span className="ios-install__glyph">
                <ShareIcon />
              </span>
              <span>
                {t.iosStep1}
                <small>
                  {t.iosStep1Alt} <MoreIcon />
                </small>
              </span>
            </li>
            <li>
              <span className="ios-install__glyph">
                <AddIcon />
              </span>
              <span>
                {t.iosStep2a} <b>Add to Home Screen</b>
                {t.iosStep2b}
              </span>
            </li>
            <li>
              <span className="ios-install__glyph ios-install__glyph--text">Add</span>
              <span>
                {t.iosStep3a} <b>Add</b>
                {t.iosStep3b}
              </span>
            </li>
          </ol>
        )}

        <button className="sheet__close" onClick={close}>
          {t.iosDone}
        </button>
      </div>
    </div>
  );
}
