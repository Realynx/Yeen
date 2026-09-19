import { describe, expect, it } from "vitest";
import { shouldShowBufferingForVideoState } from "./playerBufferingState";

describe("shouldShowBufferingForVideoState", () => {
  it("does not report buffering before playback has started", () => {
    expect(
      shouldShowBufferingForVideoState({ paused: true, ended: false }),
    ).toBe(false);
  });

  it("reports a real playback stall and ignores an ended stream", () => {
    expect(
      shouldShowBufferingForVideoState({ paused: false, ended: false }),
    ).toBe(true);
    expect(
      shouldShowBufferingForVideoState({ paused: false, ended: true }),
    ).toBe(false);
  });
});
