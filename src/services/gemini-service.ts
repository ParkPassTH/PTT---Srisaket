import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { ExtractedActivity } from "../domain/types.js";

const confidenceValue = z.preprocess((value) => {
  if (typeof value !== "number") return value;
  if (value > 1 && value <= 100) return value / 100;
  return Math.max(0, Math.min(1, value));
}, z.number().min(0).max(1)).nullable();

const outputSchema = z.object({
  transcript: z.string().min(1),
  occurredAt: z.string().datetime({ offset:true }).nullable(),
  plotId: z.string().nullable(),
  plotName: z.string().nullable(),
  crop: z.string().nullable(),
  activityType: z.string().nullable(),
  inputsUsed: z.string().nullable(),
  harvestAmount: z.number().nonnegative().nullable(),
  harvestUnit: z.string().nullable(),
  isHarvesting: z.boolean(),
  fieldConfidence: z.object({
    plotId: confidenceValue,
    crop: confidenceValue,
    activityType: confidenceValue,
    inputsUsed: confidenceValue,
    harvestAmount: confidenceValue,
    harvestUnit: confidenceValue
  })
});

export interface VoiceAnalysis {
  transcript: string;
  occurredAt?: string;
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
          { text: `ถอดเสียงภาษาไทยตามคำพูดจริง แล้วแยกข้อมูลกิจกรรมเกษตร ห้ามเดาข้อมูลที่ไม่ได้พูด ค่าไม่ทราบให้เป็น null เวลาปัจจุบันในประเทศไทยคือ ${new Date().toLocaleString("sv-SE", { timeZone:"Asia/Bangkok" })}+07:00 ให้แปลงคำเวลาเช่น เมื่อเช้า/เมื่อวานเป็น occurredAt แบบ ISO 8601 หากระบุไม่ได้ให้ null ความมั่นใจแต่ละช่องต้องเป็นเลขทศนิยม 0 ถึง 1 เท่านั้น เช่น 0.85 ห้ามใช้เปอร์เซ็นต์ 85` },
          { inlineData: { mimeType, data: audio.toString("base64") } }
        ] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            required: ["transcript", "occurredAt", "plotId", "plotName", "crop", "activityType", "inputsUsed", "harvestAmount", "harvestUnit", "isHarvesting", "fieldConfidence"],
            properties: {
              transcript: { type: "STRING" }, occurredAt: { type:"STRING", nullable:true }, plotId: { type: "STRING", nullable: true }, plotName: { type: "STRING", nullable: true }, crop: { type: "STRING", nullable: true }, activityType: { type: "STRING", nullable: true }, inputsUsed: { type: "STRING", nullable: true }, harvestAmount: { type: "NUMBER", nullable: true }, harvestUnit: { type: "STRING", nullable: true }, isHarvesting: { type: "BOOLEAN" },
              fieldConfidence: { type: "OBJECT", required: ["plotId", "crop", "activityType", "inputsUsed", "harvestAmount", "harvestUnit"], properties: { plotId: { type: "NUMBER", nullable: true }, crop: { type: "NUMBER", nullable: true }, activityType: { type: "NUMBER", nullable: true }, inputsUsed: { type: "NUMBER", nullable: true }, harvestAmount: { type: "NUMBER", nullable: true }, harvestUnit: { type: "NUMBER", nullable: true } } }
            }
          }
        }
      }),
      signal: AbortSignal.timeout(165_000)
    });
    if (!response.ok) throw new Error(`Gemini API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    const parsed = outputSchema.parse(JSON.parse(text));
    return {
      transcript: parsed.transcript,
      ...(parsed.occurredAt ? { occurredAt:parsed.occurredAt } : {}),
      ...(parsed.plotName ? { plotName: parsed.plotName } : {}),
      extracted: {
        ...(parsed.plotId ? { plotId: parsed.plotId } : {}), ...(parsed.crop ? { crop: parsed.crop } : {}), ...(parsed.activityType ? { activityType: parsed.activityType } : {}), ...(parsed.inputsUsed ? { inputsUsed: parsed.inputsUsed } : {}), ...(parsed.harvestAmount !== null ? { harvestAmount: parsed.harvestAmount } : {}), ...(parsed.harvestUnit ? { harvestUnit: parsed.harvestUnit } : {}), isHarvesting: parsed.isHarvesting, fieldConfidence: Object.fromEntries(Object.entries(parsed.fieldConfidence).filter((entry): entry is [string, number] => entry[1] !== null))
      }
    };
  }
}

export function createVoiceAnalyzer(config: AppConfig): VoiceAnalyzer | undefined {
  if (config.AI_PROVIDER === "gemini" && config.GEMINI_API_KEY) return new GeminiService(config.GEMINI_API_KEY, config.GEMINI_MODEL);
  return undefined;
}
