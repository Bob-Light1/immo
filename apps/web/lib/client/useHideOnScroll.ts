"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Distance travelled in one direction before the bar reacts. Below this a
 * shaking hand, or the rubber-band at the end of a flick, would flip it back
 * and forth.
 */
const THRESHOLD = 12;

/** Within this many pixels of the top the bar always shows. */
const TOP_ZONE = 64;

/** Where the reader is, and what the bar currently does about it. */
export type ScrollState = {
  y: number;
  /** Signed distance run in the current direction; reset when it flips. */
  run: number;
  hidden: boolean;
};

export const initialScrollState = (y = 0): ScrollState => ({ y, run: 0, hidden: false });

/**
 * The decision behind the hook, kept pure so the thresholds can be tested
 * without a DOM: the interesting behaviour is in the hysteresis and the two
 * edge zones, not in the event plumbing.
 *
 * Scrolling down means the reader wants the page; scrolling up means they are
 * looking for something, and on a phone that is usually the navigation.
 */
export function nextScrollState(
  prev: ScrollState,
  view: { y: number; viewport: number; page: number },
): ScrollState {
  const delta = view.y - prev.y;

  // At the top nothing is covered yet, and at the very bottom the rows under
  // the bar are precisely the ones being read.
  const atBottom = view.y + view.viewport >= view.page - 1;
  if (view.y < TOP_ZONE || atBottom) return { y: view.y, run: 0, hidden: false };

  const run = Math.sign(delta) === Math.sign(prev.run) ? prev.run + delta : delta;
  const hidden = run > THRESHOLD ? true : run < -THRESHOLD ? false : prev.hidden;
  return { y: view.y, run, hidden };
}

/**
 * Reports whether a bottom bar should step out of the way as the page scrolls.
 *
 * Returns a `reveal` callback so the caller can force it back: a focus moving
 * into the bar, or a route change, must not leave it off-screen.
 */
export function useHideOnScroll(enabled: boolean) {
  const [hidden, setHidden] = useState(false);
  const state = useRef<ScrollState>(initialScrollState());

  const reveal = useCallback(() => {
    state.current = { ...state.current, run: 0, hidden: false };
    setHidden(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      state.current = initialScrollState(window.scrollY);
      setHidden(false);
      return;
    }

    state.current = initialScrollState(window.scrollY);
    let queued = false;

    const update = () => {
      queued = false;
      state.current = nextScrollState(state.current, {
        y: window.scrollY,
        viewport: window.innerHeight,
        page: document.documentElement.scrollHeight,
      });
      setHidden(state.current.hidden);
    };

    // One update per frame: scroll fires far more often than the screen paints.
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  return { hidden, reveal };
}
