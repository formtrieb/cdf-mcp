import { readFileSync } from "node:fs";
import { join } from "node:path";

export class TokenLoader {
  private tokensPath: string;
  private sets: Map<string, Record<string, unknown>> = new Map();
  private tokenSetOrder: string[] = [];

  constructor(tokensPath: string) {
    this.tokensPath = tokensPath;
  }

  load(): void {
    const metadataPath = join(this.tokensPath, "$metadata.json");
    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    this.tokenSetOrder = metadata.tokenSetOrder;

    this.sets.clear();
    for (const setName of this.tokenSetOrder) {
      const filePath = join(this.tokensPath, ...setName.split("/")) + ".json";
      try {
        const data = JSON.parse(readFileSync(filePath, "utf-8"));
        this.sets.set(setName, data);
      } catch {
        // Set listed in metadata but file missing — skip
      }
    }
  }

  getTokenSetOrder(): string[] {
    return this.tokenSetOrder;
  }

  getAllSets(): Map<string, Record<string, unknown>> {
    return this.sets;
  }
}
