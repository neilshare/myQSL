export * from "./binary-reader";
export * from "./wsjtx";
export * from "./n1mm";
import { decodeWsjtx } from "./wsjtx";
import { decodeN1mm } from "./n1mm";

export function decodeDatagram(bytes: Uint8Array, sourceKind: "wsjtx" | "n1mm") {
  return sourceKind === "wsjtx" ? decodeWsjtx(bytes) : decodeN1mm(bytes);
}
