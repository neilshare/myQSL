import { describe, expect, it } from "vitest";
import { API_PATHS, cardImagePath, publicCardPath } from "../src/api-paths";

describe("API Paths", () => {
  it("freezes canonical API paths", () => {
    expect(API_PATHS.qsos).toBe("/api/v1/qsos");
    expect(API_PATHS.templates).toBe("/api/v1/card-templates");
    expect(API_PATHS.cards).toBe("/api/v1/cards");
    expect(API_PATHS.publicLookup).toBe("/api/v1/public/card-lookup");
    expect(API_PATHS.backups).toBe("/api/v1/backups");
  });

  it("formats public card and image paths correctly", () => {
    expect(publicCardPath("abc-123")).toBe("/c/abc-123");
    expect(publicCardPath("foo/bar")).toBe("/c/foo%2Fbar");
    expect(cardImagePath("card-456")).toBe("/api/v1/cards/card-456/image");
  });
});
