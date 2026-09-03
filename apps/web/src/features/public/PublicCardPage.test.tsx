import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicCardPage } from "./PublicCardPage";

describe("PublicCardPage", () => {
  it("shows the published card image and verification metadata", () => {
    render(<PublicCardPage card={{ qso: { call: "BG4YYY", qso_date: "20260903", time_on: "143000" }, image_url: "/cards/a.png" }} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/cards/a.png");
    expect(screen.getByText("BG4YYY")).toBeTruthy();
  });
});
