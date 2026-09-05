import { parseAdif } from "@myqsl/adif-codec";
import { recordToQso } from "./adif-mapper";

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const text = new TextDecoder("utf-8").decode(event.data.buffer);
    const parsed = parseAdif(text);
    if (parsed.errors.length > 0) {
      self.postMessage({
        type: "error",
        error: parsed.errors[0]?.detail ?? "ADIF parse failed"
      });
      return;
    }
    const records = parsed.records.map(recordToQso);
    self.postMessage({ type: "done", records });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Failed to parse ADIF in worker"
    });
  }
};
