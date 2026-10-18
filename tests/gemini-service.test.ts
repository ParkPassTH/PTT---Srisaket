import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GeminiService } from "../src/services/gemini-service.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Gemini voice analyzer", () => {
  it("uses a Gemini-compatible fixed confidence schema", async () => {
    let requestBody: any;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:JSON.stringify({ transcript:"รดน้ำแปลงเหนือ", occurredAt:"2026-10-18T08:00:00+07:00", plotId:null, plotName:"แปลงเหนือ", crop:null, activityType:"รดน้ำ", inputsUsed:null, harvestAmount:null, harvestUnit:null, isHarvesting:false, fieldConfidence:{ plotId:null, crop:null, activityType:94, inputsUsed:null, harvestAmount:null, harvestUnit:null } }) }] } }] }), { status:200 });
    };
    const result = await new GeminiService("test-key", "test-model").analyze(Buffer.from("audio"), "audio/mp4");
    const confidenceSchema = requestBody.generationConfig.responseSchema.properties.fieldConfidence;
    assert.equal(confidenceSchema.additionalProperties, undefined);
    assert.equal(confidenceSchema.properties.activityType.type, "NUMBER");
    assert.deepEqual(result.extracted.fieldConfidence, { activityType:0.94 });
    assert.equal(result.occurredAt, "2026-10-18T08:00:00+07:00");
  });
});
