import type { AiAssetDefinition, AiAssetGenerationSettings } from "@ai-game-assets/core";

export type GenerateAssetRequest = {
  asset: AiAssetDefinition;
  prompt?: string;
  count?: number;
  settings?: AiAssetGenerationSettings;
  references?: GenerateAssetReference[];
};

export type GenerateAssetReference = {
  image: Uint8Array;
  mimeType: string;
  fileName: string;
};

export type GeneratedAssetOption = {
  image: Uint8Array;
  mimeType: string;
  prompt: string;
  model?: string;
  revisedPrompt?: string;
  settings?: AiAssetGenerationSettings;
};

export type AiImageProvider = {
  generate(request: GenerateAssetRequest): Promise<GeneratedAssetOption[]>;
};

export type OpenAiImageProviderOptions = {
  apiKey?: string;
  model?: string;
  quality?: AiAssetGenerationSettings["quality"];
  background?: AiAssetGenerationSettings["background"];
};

export function createOpenAiImageProvider(
  options: OpenAiImageProviderOptions = {}
): AiImageProvider {
  return {
    async generate(request) {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required to generate AI game assets.");
      }

      const model =
        request.settings?.model ??
        request.asset.settings?.model ??
        options.model ??
        "gpt-image-1.5";
      const prompt = request.prompt ?? request.asset.prompt;
      const requestedFormat =
        request.settings?.format ?? request.asset.settings?.format ?? "png";
      const outputFormat = normalizeOutputFormat(requestedFormat);
      const requestBody = {
        model,
        prompt: gameAssetPrompt(request, prompt),
        n: request.count ?? 1,
        size: request.settings?.size ?? request.asset.settings?.size ?? "1024x1024",
        quality:
          request.settings?.quality ??
          request.asset.settings?.quality ??
          options.quality ??
          "auto",
        background:
          request.settings?.background ??
          request.asset.settings?.background ??
          options.background ??
          "transparent",
        output_format: outputFormat,
        moderation: request.settings?.moderation ?? request.asset.settings?.moderation
      };
      const response = request.references?.length
        ? await createImageEdit(apiKey, requestBody, request.references)
        : await createImageGeneration(apiKey, requestBody);

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `OpenAI image generation failed (${response.status}): ${openAiErrorMessage(body)}`
        );
      }

      const payload = await response.json() as {
        data?: Array<{ b64_json?: string; revised_prompt?: string }>;
      };

      return (payload.data ?? []).map((item) => {
        if (!item.b64_json) {
          throw new Error("OpenAI image generation response did not include b64_json.");
        }

        return {
          image: Buffer.from(item.b64_json, "base64"),
          mimeType: mimeTypeFromOutputFormat(outputFormat),
          prompt,
          model,
          revisedPrompt: item.revised_prompt,
          settings: {
            ...request.asset.settings,
            ...request.settings,
            model,
            format: outputFormat === "jpeg" ? "jpg" : outputFormat
          }
        };
      });
    }
  };
}

function gameAssetPrompt(request: GenerateAssetRequest, prompt: string): string {
  const lines = [
    prompt,
    "",
    "Create this as a clean 2D game asset sprite.",
    `Asset kind: ${request.asset.kind}.`,
    `Target canvas: ${request.asset.dimensions.width}x${request.asset.dimensions.height}.`,
    "Use a transparent background, readable silhouette, centered subject, no text, no watermark."
  ];

  if (request.asset.frameGrid) {
    lines.push(
      `Create a ${request.asset.frameGrid.columns} column by ${request.asset.frameGrid.rows} row spritesheet.`,
      `Each frame is ${request.asset.frameGrid.frameWidth}x${request.asset.frameGrid.frameHeight}.`,
      "Keep each frame aligned to the grid with consistent scale and spacing."
    );
  }

  if (request.references?.length) {
    lines.push(
      "Use the provided reference image for character identity, colors, silhouette, and materials."
    );
  }

  return lines.join("\n");
}

async function createImageGeneration(
  apiKey: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function createImageEdit(
  apiKey: string,
  body: Record<string, unknown>,
  references: GenerateAssetReference[]
): Promise<Response> {
  const form = new FormData();

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      form.append(key, String(value));
    }
  }

  for (const reference of references) {
    form.append(
      "image[]",
      new Blob([arrayBufferFromBytes(reference.image)], { type: reference.mimeType }),
      reference.fileName
    );
  }

  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function normalizeOutputFormat(
  format: AiAssetGenerationSettings["format"] | undefined
): "png" | "webp" | "jpeg" {
  if (format === "webp") return "webp";
  if (format === "jpg") return "jpeg";
  return "png";
}

function mimeTypeFromOutputFormat(format: "png" | "webp" | "jpeg"): string {
  switch (format) {
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
  }
}

function openAiErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        code?: string;
        type?: string;
      };
    };
    const message = parsed.error?.message ?? body;
    const code = parsed.error?.code ?? parsed.error?.type;
    return code ? `${message} (${code})` : message;
  } catch {
    return body;
  }
}
