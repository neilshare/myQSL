import type { CardScene, ScenePrimitive } from "@myqsl/card-scene";

export type CanvasSceneImage = { image: CanvasImageSource; width: number; height: number };
export type CanvasSceneResources = { images: ReadonlyMap<string, CanvasSceneImage>; fontFamilies?: ReadonlyMap<string, string> };

function parseColor(value: string): string {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#000000";
}

function assertRenderable(scene: CardScene): void {
  const errors = scene.issues.filter((issue) => issue.level === "error");
  if (errors.length) throw new Error(`Card scene has ${errors.length} blocking issue(s): ${errors.map((issue) => issue.code).join(", ")}`);
}

function drawPrimitive(context: CanvasRenderingContext2D, primitive: ScenePrimitive, pxPerMm: number, resources: CanvasSceneResources): void {
  if (primitive.type === "rect") {
    context.fillStyle = parseColor(primitive.fill);
    context.fillRect(primitive.xMm * pxPerMm, primitive.yMm * pxPerMm, primitive.widthMm * pxPerMm, primitive.heightMm * pxPerMm);
    return;
  }
  if (primitive.type === "text") {
    const sizePx = primitive.sizePt * (25.4 / 72) * pxPerMm;
    context.font = `${sizePx}px ${resources.fontFamilies?.get(primitive.fontId) ?? primitive.fontId}`;
    context.fillStyle = parseColor(primitive.color);
    context.textAlign = primitive.align;
    const x = primitive.align === "left" ? primitive.xMm : primitive.align === "center" ? primitive.xMm + primitive.widthMm / 2 : primitive.xMm + primitive.widthMm;
    context.fillText(primitive.text, x * pxPerMm, primitive.baselineMm * pxPerMm);
    return;
  }
  const resource = resources.images.get(primitive.assetId);
  if (!resource) throw new Error(`Scene image asset ${primitive.assetId} is unavailable`);
  const sourceX = primitive.crop.x * resource.width;
  const sourceY = primitive.crop.y * resource.height;
  const sourceWidth = primitive.crop.width * resource.width;
  const sourceHeight = primitive.crop.height * resource.height;
  context.drawImage(resource.image, sourceX, sourceY, sourceWidth, sourceHeight, primitive.xMm * pxPerMm, primitive.yMm * pxPerMm, primitive.widthMm * pxPerMm, primitive.heightMm * pxPerMm);
}

export async function renderSceneToCanvas(canvas: HTMLCanvasElement, scene: CardScene, resources: CanvasSceneResources): Promise<void> {
  assertRenderable(scene);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  const pxPerMm = canvas.width / scene.widthMm;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = parseColor(scene.background);
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const primitive of scene.primitives) drawPrimitive(context, primitive, pxPerMm, resources);
}
