import { parseAdif, serializeAdif, type AdifMetadata, type AdifRecord } from "@eqsr/adif-codec";

type RequestMessage = { id: string; kind: "parse"; text: string } | { id: string; kind: "serialize"; records: AdifRecord[]; metadata: AdifMetadata } | { id: string; kind: "cancel" };
const cancelled = new Set<string>();
self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  if (message.kind === "cancel") { cancelled.add(message.id); return; }
  try {
    if (message.kind === "parse") self.postMessage({ id: message.id, kind: "parsed", result: parseAdif(message.text) });
    else self.postMessage({ id: message.id, kind: "serialized", text: serializeAdif(message.records, message.metadata) });
  } catch (error) { self.postMessage({ id: message.id, kind: "error", code: "SERIALIZE_FAILED", detail: error instanceof Error ? error.message : "ADIF worker failed" }); }
};
