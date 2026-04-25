import { describe, expect, it } from "vitest";

import { isCroppedBoardWindow, isLocalBoardDisplay } from "./boardDisplay";

describe("board display labels", () => {
  it("marks 19x19 corner problems as local displays", () => {
    expect(
      isLocalBoardDisplay({
        boardSize: 19,
        stones: [
          { x: 16, y: 3, color: "black" },
          { x: 17, y: 3, color: "white" },
        ],
      }),
    ).toBe(true);
  });

  it("does not mark a full 19x19 position as local", () => {
    expect(
      isCroppedBoardWindow(19, [
        { x: 0, y: 0, color: "black" },
        { x: 18, y: 18, color: "white" },
      ]),
    ).toBe(false);
  });

  it("keeps actual 9x9 boards as standard size labels", () => {
    expect(
      isLocalBoardDisplay({
        boardSize: 9,
        stones: [{ x: 4, y: 4, color: "black" }],
      }),
    ).toBe(false);
  });
});
