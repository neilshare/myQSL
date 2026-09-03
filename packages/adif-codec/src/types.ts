export type AdifRecord = {
  fields: Record<string, string>;
  types: Record<string, string | undefined>;
};

export type AdifErrorCode = "INVALID_TAG" | "TRUNCATED_VALUE" | "MISSING_EOR" | "NON_ASCII_ADI";
export type AdifError = { code: AdifErrorCode; offset: number; line: number; detail: string };
export type AdifParseResult = { header: AdifRecord | null; records: AdifRecord[]; errors: AdifError[] };
export type AdifMetadata = { programId: string; adifVersion: string };
