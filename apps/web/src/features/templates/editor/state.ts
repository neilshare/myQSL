import type { TemplateV2 } from "@myqsl/domain";
import type { EditorCommand } from "./commands";
import { applyEditorCommand } from "./commands";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
export type EditorState = { document: TemplateV2; baseVersion: number; selection: string | null; dirty: boolean; saveStatus: SaveStatus };

export function createEditorState(document: TemplateV2, baseVersion = 1): EditorState {
  return { document, baseVersion, selection: null, dirty: false, saveStatus: "idle" };
}

export function reduceEditorState(state: EditorState, command: EditorCommand): EditorState {
  const document = applyEditorCommand(state.document, command);
  return { ...state, document, dirty: document !== state.document, saveStatus: "dirty" };
}
