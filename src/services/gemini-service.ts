import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { ExtractedActivity } from "../domain/types.js";

const outputSchema = z.object({
  transcript: z.string().min(1),
  plotId: z.string().nullable(),
  plotName: z.string().nullable(),
  crop: z.string().nullable(),
  activityType: z.string().nullable(),
  inputsUsed: z.string().nullable(),
  harvestAmount: z.number().nonnegative().nullable(),
  harvestUnit: z.string().nullable(),
  isHarvesting: z.boolean(),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1))
});

export interface VoiceAnalysis {
  transcript: string;
  plotName?: string;
  extracted: ExtractedActivity;
}

export interface VoiceAnalyzer {
  analyze(audio: Buffer, mimeType: string): Promise<VoiceAnalysis>;
}

export class GeminiService implements VoiceAnalyzer {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async analyze(audio: Buffer, mimeType: string): Promise<VoiceAnalysis> {
    if (audio.length > 18 * 1024 * 1024) throw new Error("Audio exceeds the 18 MB inline processing limit");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { text: "ถอดเสียงภาษาไทยตามคำพูดจริง แล้วแยกข้อมูลกิจกรรมเกษตร ห้ามเดาข้อมูลที่ไม่ได้พูด ค่าไม่ทราบให้เป็น null ความมั่นใจแต่ละช่องเป็น 0 ถึง 1" },
          { inlineData: { mimeType, data: audio.toString("base64") } }
        ] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            required: ["transcript", "plotId", "plotName", "crop", "activityType", "inputsUsed", "harvestAmount", "harvestUnit", "isHarvesting", "fieldConfidence"],
            properties: {
              transcript: { type: "STRING" }, plotId: { type: "STRING", nullable: true }, plotName: { type: "STRING", nullable: true }, crop: { type: "STRING", nullable: true }, activityType: { type: "STRING", nullable: true }, inputsUsed: { type: "STRING", nullable: true }, harvestAmount: { type: "NUMBER", nullable: true }, harvestUnit: { type: "STRING", nullable: true }, isHarvesting: { type: "BOOLEAN" }, fieldConfidence: { type: "OBJECT", additionalProperties: { type: "NUMBER" } }
            }
          }
        }
      }),
      signal: AbortSignal.timeout(45_000)
    });
    if (!response.ok) throw new Error(`Gemini API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const parsed = outputSchema.parse(JSON.parse(text));
    return {
      transcript: parsed.transcript,
      ...(parsed.plotName ? { plotName: parsed.plotName } : {}),
      extracted: {
        ...(parsed.plotId ? { plotId: parsed.plotId } : {}), ...(parsed.crop ? { crop: parsed.crop } : {}), ...(parsed.activityType ? { activityType: parsed.activityType } : {}), ...(parsed.inputsUsed ? { inputsUsed: parsed.inputsUsed } : {}), ...(parsed.harvestAmount !== null ? { harvestAmount: parsed.harvestAmount } : {}), ...(parsed.harvestUnit ? { harvestUnit: parsed.harvestUnit } : {}), isHarvesting: parsed.isHarvesting, fieldConfidence: parsed.fieldConfidence
      }
    };
  }
}

export function createVoiceAnalyzer(config: AppConfig): VoiceAnalyzer | undefined {
  if (config.AI_PROVIDER === "gemini" && config.GEMINI_API_KEY) return new GeminiService(config.GEMINI_API_KEY, config.GEMINI_MODEL);
  return undefined;
}
