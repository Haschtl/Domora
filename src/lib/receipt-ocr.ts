export const RECEIPT_OCR_MODEL_ID = "Xenova/trocr-small-printed";

export type ReceiptOcrProgressReport = {
  progress: number;
  text: string;
};

export type ReceiptOcrPassInput<TId extends string = string> = {
  id: TId;
  canvas: HTMLCanvasElement;
};

export type ReceiptOcrPassResult<TId extends string = string> = {
  id: TId;
  text: string;
};

type ImageToTextPipelineLike = (
  input: HTMLCanvasElement,
  options?: { max_new_tokens?: number }
) => Promise<Array<{ generated_text?: string }>>;

type TransformersModule = {
  env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
  };
  pipeline: (
    task: "image-to-text",
    model: string,
    options: {
      device?: "webgpu" | "wasm";
      dtype?: "fp16" | "q8";
      progress_callback?: (event: { status?: string; progress?: number; file?: string; name?: string }) => void;
    }
  ) => Promise<ImageToTextPipelineLike>;
};

let pipelinePromise: Promise<ImageToTextPipelineLike> | null = null;
let latestProgressCallback: ((report: ReceiptOcrProgressReport) => void) | null = null;

const isWebGpuAvailable = () => typeof navigator !== "undefined" && "gpu" in navigator;

const mapProgressText = (event: { status?: string; file?: string; name?: string }) => {
  const label = event.file ?? event.name ?? "";
  switch (event.status) {
    case "download":
    case "progress":
    case "progress_total":
      return label ? `Loading ${label}` : "Loading OCR model";
    case "ready":
      return "OCR model ready";
    default:
      return label ? `Preparing ${label}` : "Preparing OCR model";
  }
};

const createPipeline = async (device: "webgpu" | "wasm", dtype: "fp16" | "q8") => {
  const { env, pipeline } = (await import("@huggingface/transformers")) as TransformersModule;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  return pipeline("image-to-text", RECEIPT_OCR_MODEL_ID, {
    device,
    dtype,
    progress_callback: (event) => {
      latestProgressCallback?.({
        progress: Math.max(0, Math.min(1, (event.progress ?? 0) / 100)),
        text: mapProgressText(event)
      });
    }
  });
};

const getOrCreateReceiptOcrPipeline = (onProgress?: (report: ReceiptOcrProgressReport) => void) => {
  latestProgressCallback = onProgress ?? null;

  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      if (isWebGpuAvailable()) {
        try {
          return await createPipeline("webgpu", "fp16");
        } catch {
          // Fall back to WASM for browsers with partial WebGPU support.
        }
      }
      return createPipeline("wasm", "q8");
    })().catch((error) => {
      pipelinePromise = null;
      throw error;
    });
  }

  return pipelinePromise;
};

const normalizeOcrText = (value: string) =>
  value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

export const extractReceiptTextWithModernOcr = async <TId extends string>(
  passes: ReceiptOcrPassInput<TId>[],
  onProgress?: (report: ReceiptOcrProgressReport) => void
): Promise<ReceiptOcrPassResult<TId>[]> => {
  if (passes.length === 0) return [];
  const ocr = await getOrCreateReceiptOcrPipeline(onProgress);
  const results: ReceiptOcrPassResult<TId>[] = [];

  for (const pass of passes) {
    const output = await ocr(pass.canvas, { max_new_tokens: 256 });
    const text = normalizeOcrText(output.map((entry) => entry.generated_text ?? "").join("\n"));
    results.push({ id: pass.id, text });
  }

  return results;
};
