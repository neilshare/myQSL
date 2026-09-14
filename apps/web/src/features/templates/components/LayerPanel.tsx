import type { TemplateV2 } from "@myqsl/domain";
import type { StageEditorCommand } from "../editor/commands";

export function LayerPanel({ document, onCommand }: { document: TemplateV2; onCommand: (command: StageEditorCommand) => void }) {
  return <section aria-label="图层列表"><h3>图层</h3><ul>{[...document.elements].reverse().map((element) => <li key={element.id}><button type="button" onClick={() => onCommand({ type: "set-visible", ids: [element.id], visible: !element.visible })}>{element.visible ? "隐藏" : "显示"} {element.name}</button></li>)}</ul></section>;
}
