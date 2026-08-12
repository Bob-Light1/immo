import { describe, expect, it } from "vitest";
import { initialScrollState, nextScrollState, type ScrollState } from "./useHideOnScroll";

const VIEWPORT = 640;
const PAGE = 4000;

/**
 * Walks a sequence of scroll offsets and returns the state it ends in. The
 * first offset is where the reader already is, not a jump to it — otherwise
 * every sequence would open with one huge downward move.
 */
function scrollTo([start, ...rest]: number[]): ScrollState {
  return rest.reduce<ScrollState>(
    (state, y) => nextScrollState(state, { y, viewport: VIEWPORT, page: PAGE }),
    initialScrollState(start),
  );
}

describe("nextScrollState", () => {
  it("hides once the reader has scrolled down past the threshold", () => {
    expect(scrollTo([200, 260]).hidden).toBe(true);
  });

  it("stays visible for a movement smaller than the threshold", () => {
    expect(scrollTo([200, 208]).hidden).toBe(false);
  });

  it("comes back as soon as the reader scrolls up", () => {
    const down = scrollTo([200, 400]);
    expect(down.hidden).toBe(true);
    expect(nextScrollState(down, { y: 380, viewport: VIEWPORT, page: PAGE }).hidden).toBe(false);
  });

  it("ignores jitter around a resting position", () => {
    // Ten alternating pixels: each flip resets the run, so neither direction
    // ever reaches the threshold and the bar never moves.
    const offsets = Array.from({ length: 10 }, (_, i) => 300 + (i % 2 ? 4 : 0));
    expect(scrollTo(offsets).hidden).toBe(false);
  });

  it("needs a sustained run, not a single large frame, in each direction", () => {
    // A slow drift down: four frames of 4px add up past the threshold.
    expect(scrollTo([300, 304, 308, 312, 316]).hidden).toBe(true);
  });

  it("always shows in the top zone, whatever the direction", () => {
    const down = scrollTo([200, 400]);
    expect(nextScrollState(down, { y: 40, viewport: VIEWPORT, page: PAGE }).hidden).toBe(false);
  });

  it("always shows at the end of the page, where the last rows are read", () => {
    const y = PAGE - VIEWPORT;
    // Reaching the bottom is a downward move, which would otherwise hide it.
    expect(scrollTo([y - 200, y]).hidden).toBe(false);
  });

  it("does not hide on a page too short to scroll", () => {
    const short = { viewport: VIEWPORT, page: VIEWPORT };
    expect(nextScrollState(initialScrollState(), { y: 0, ...short }).hidden).toBe(false);
  });
});
