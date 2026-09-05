import { describe, expect, it } from "vitest";
import { parseSchemasFromYaml, generateApiTypes } from "./generate-api-client.mts";

describe("generate-api-client generator", () => {
  it("parses schemas from OpenAPI YAML and generates TypeScript interfaces", () => {
    const yamlSample = `
openapi: 3.1.0
components:
  schemas:
    QsoRecord:
      type: object
      properties:
        id:
          type: integer
        call:
          type: string
        submode:
          type: string
          nullable: true
        adif_extra_json:
          type: string
      required:
        - id
        - call
    CardRow:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
          enum:
            - draft
            - published
            - void
      required:
        - id
        - status
`;

    const parsed = parseSchemasFromYaml(yamlSample);
    expect(parsed.QsoRecord).toBeDefined();
    expect(parsed.QsoRecord.properties).toHaveLength(4);

    const callProp = parsed.QsoRecord.properties.find((p) => p.name === "call");
    expect(callProp?.rawType).toBe("string");
    expect(callProp?.isRequired).toBe(true);

    const submodeProp = parsed.QsoRecord.properties.find((p) => p.name === "submode");
    expect(submodeProp?.nullable).toBe(true);
    expect(submodeProp?.isRequired).toBe(false);

    const cardRow = parsed.CardRow;
    expect(cardRow).toBeDefined();
    const statusProp = cardRow.properties.find((p) => p.name === "status");
    expect(statusProp?.enumValues).toEqual(["draft", "published", "void"]);

    const tsCode = generateApiTypes(parsed);
    expect(tsCode).toContain("export interface QsoRecord {");
    expect(tsCode).toContain("  id: number;");
    expect(tsCode).toContain("  call: string;");
    expect(tsCode).toContain("  submode?: string | null;");
    expect(tsCode).toContain("  adif_extra?: Record<string, string>;");
    expect(tsCode).toContain('export interface CardRow {');
    expect(tsCode).toContain('  status: "draft" | "published" | "void";');
  });
});
