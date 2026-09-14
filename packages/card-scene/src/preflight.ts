import type { CardScene, Issue, ScenePrimitive } from "./types";

export type SceneAssetMetadata = {
  id: string;
  widthPx: number;
  heightPx: number;
  sha256?: string;
  expectedSha256?: string;
};

export type ScenePreflightProfile = "single-bleed-v2" | "a4-four-up-v2";

const SAFE = { left: 5, top: 5, right: 135, bottom: 85 };

function issue(code: string, elementId: string, message: string, level: "error" | "warning" = "error"): Issue {
  return { code, elementId, level, message };
}

function outsideSafe(x: number, y: number, width: number, height: number): boolean {
  return x < SAFE.left || y < SAFE.top || x + width > SAFE.right || y + height > SAFE.bottom;
}

function dpi(asset: SceneAssetMetadata, widthMm: number, heightMm: number): number {
  return Math.min(asset.widthPx / (widthMm / 25.4), asset.heightPx / (heightMm / 25.4));
}

function checkAsset(primitive: Extract<ScenePrimitive, { type: "image" }>, assets: ReadonlyMap<string, SceneAssetMetadata>): Issue[] {
  const asset = assets.get(primitive.assetId);
  if (!asset) return [issue("ASSET_MISSING", primitive.id, `Image asset ${primitive.assetId} is unavailable`)];
  const issues: Issue[] = [];
  const effectiveDpi = dpi(asset, primitive.widthMm * primitive.crop.width, primitive.heightMm * primitive.crop.height);
  if (effectiveDpi < 150) issues.push(issue("IMAGE_DPI_LOW", primitive.id, `Effective image DPI ${Math.round(effectiveDpi)} is below 150`));
  else if (effectiveDpi < 300) issues.push(issue("IMAGE_DPI_LOW", primitive.id, `Effective image DPI ${Math.round(effectiveDpi)} is below 300`, "warning"));
  if (asset.expectedSha256 && asset.sha256 && asset.expectedSha256.toLowerCase() !== asset.sha256.toLowerCase()) issues.push(issue("ASSET_HASH_MISMATCH", primitive.id, `Image asset ${primitive.assetId} hash does not match the expected immutable hash`));
  return issues;
}

function checkQrDensity(primitives: ScenePrimitive[]): Issue[] {
  const issues: Issue[] = [];
  const quietById = new Map<string, Extract<ScenePrimitive, { type: "rect" }>>();
  for (const primitive of primitives) {
    if (primitive.type === "rect" && primitive.id.endsWith(":quiet")) quietById.set(primitive.id.slice(0, -6), primitive);
  }
  for (const [id, quiet] of quietById) {
    const modules = primitives.filter((primitive) => primitive.type === "rect" && primitive.id.startsWith(`${id}:module:`));
    const moduleMm = modules[0]?.widthMm ?? 0;
    if (quiet.widthMm < 21 || quiet.heightMm < 21 || moduleMm < 0.25) issues.push(issue("QR_TOO_DENSE", id, "QR quiet-zone box or module size is too small for reliable print decoding"));
  }
  return issues;
}

export function preflightScene(scene: CardScene, assets: ReadonlyMap<string, SceneAssetMetadata>, _profile: ScenePreflightProfile): Issue[] {
  const issues: Issue[] = [...scene.issues];
  for (const primitive of scene.primitives) {
    if (primitive.type === "text" && outsideSafe(primitive.xMm, primitive.baselineMm - primitive.lineHeightMm, primitive.widthMm, primitive.lineHeightMm)) issues.push(issue("SAFE_AREA", primitive.id, "Text extends outside the 5 mm safe area"));
    if (primitive.type === "image") {
      if (outsideSafe(primitive.xMm, primitive.yMm, primitive.widthMm, primitive.heightMm)) issues.push(issue("SAFE_AREA", primitive.id, "Image extends outside the 5 mm safe area"));
      issues.push(...checkAsset(primitive, assets));
    }
    if (primitive.type === "rect" && primitive.id.endsWith(":quiet") && outsideSafe(primitive.xMm, primitive.yMm, primitive.widthMm, primitive.heightMm)) issues.push(issue("SAFE_AREA", primitive.id, "QR extends outside the 5 mm safe area"));
  }
  issues.push(...checkQrDensity(scene.primitives));
  return issues;
}
