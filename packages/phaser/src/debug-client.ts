import type {
  AiAssetGenerationSettings,
  AiAssetManifest,
  AiAudioPlaybackSettings,
  AiAudioGenerationSettings,
  AiVoiceGenerationSettings
} from "@ai-game-assets/core";

export type GenerateDebugOptionsRequest = {
  assetId: string;
  prompt?: string;
  count?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  frameCount?: number;
  format?: AiAssetGenerationSettings["format"];
  audioSettings?: AiAudioGenerationSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  styleGuide?: DebugStyleGuideDraft;
};

export type DebugStyleGuideDraft = {
  prompt?: string;
  images: Array<{
    name: string;
    dataUrl: string;
  }>;
};

export type GeneratedDebugOption = {
  index: number;
  dataUrl: string;
  mimeType: string;
  prompt: string;
  model?: string;
  revisedPrompt?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  frameGrid?: {
    frameCount?: number;
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    margin?: number;
    spacing?: number;
  };
  animations?: Array<{
    key: string;
    frames: number[];
    frameRate: number;
    repeat?: number;
    prompt?: string;
    frameTimings?: Array<{
      delayMs?: number;
      offsetX?: number;
      offsetY?: number;
      scaleX?: number;
      scaleY?: number;
      rotation?: number;
      tag?: string;
    }>;
  }>;
  settings?: AiAssetGenerationSettings;
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAudioPlaybackSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  durationSeconds?: number;
};

export type SaveDebugOptionRequest = {
  assetId: string;
  versionName: string;
  dataUrl: string;
  prompt: string;
  model?: string;
  revisedPrompt?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  frameGrid?: GeneratedDebugOption["frameGrid"];
  animations?: GeneratedDebugOption["animations"];
  settings?: AiAssetGenerationSettings;
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAudioPlaybackSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  durationSeconds?: number;
  activate?: boolean;
  notes?: string;
};

export type EnsureFirstDraftsRequest = {
  assetIds?: string[];
};

export type EnsureFirstDraftsResult = {
  manifest: AiAssetManifest;
  generated: Array<{
    assetId: string;
    versionName: string;
  }>;
};

export type AiAssetDebugClientRequestOptions = {
  signal?: AbortSignal;
};

export class AiAssetDebugClient {
  readonly endpoint: string;

  constructor(endpoint = "http://127.0.0.1:3977") {
    this.endpoint = endpoint.replace(/\/$/, "");
  }

  async generate(
    request: GenerateDebugOptionsRequest,
    options: AiAssetDebugClientRequestOptions = {}
  ): Promise<GeneratedDebugOption[]> {
    const url = `${this.endpoint}/__ai-assets/generate`;
    const response = await fetchDebugEndpoint(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }

    const body = await response.json() as { options: GeneratedDebugOption[] };
    return body.options;
  }

  async generateStream(
    request: GenerateDebugOptionsRequest,
    onOption: (option: GeneratedDebugOption) => void,
    options: AiAssetDebugClientRequestOptions = {}
  ): Promise<GeneratedDebugOption[]> {
    const url = `${this.endpoint}/__ai-assets/generate-stream`;
    const response = await fetchDebugEndpoint(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      signal: options.signal
    });

    if (!response.ok) {
      const generated = await this.generate(request, options);
      generated.forEach(onOption);
      return generated;
    }

    if (!response.body) {
      const generated = await this.generate(request, options);
      generated.forEach(onOption);
      return generated;
    }

    const generated: GeneratedDebugOption[] = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const consumeLine = (line: string) => {
      if (!line.trim()) return;

      const event = JSON.parse(line) as
        | { type: "option"; option: GeneratedDebugOption }
        | { type: "error"; error: string }
        | { type: "done" };

      if (event.type === "option") {
        generated.push(event.option);
        onOption(event.option);
        return;
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }
    };

    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        consumeLine(line);
      }

      if (chunk.done) break;
    }

    consumeLine(buffer);
    return generated.sort((left, right) => left.index - right.index);
  }

  async getManifest(): Promise<AiAssetManifest> {
    const url = `${this.endpoint}/__ai-assets/manifest`;
    const response = await fetchDebugEndpoint(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }

    return response.json() as Promise<AiAssetManifest>;
  }

  async ensureFirstDrafts(
    request: EnsureFirstDraftsRequest = {}
  ): Promise<EnsureFirstDraftsResult> {
    const url = `${this.endpoint}/__ai-assets/ensure-first-drafts`;
    const response = await fetchDebugEndpoint(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }

    return response.json() as Promise<EnsureFirstDraftsResult>;
  }

  async save(request: SaveDebugOptionRequest): Promise<void> {
    const url = `${this.endpoint}/__ai-assets/save`;
    const response = await fetchDebugEndpoint(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
  }

  async promoteStyle(styleGuide: DebugStyleGuideDraft): Promise<void> {
    const url = `${this.endpoint}/__ai-assets/style`;
    const response = await fetchDebugEndpoint(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(styleGuide)
    });

    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
  }
}

async function fetchDebugEndpoint(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error(
      [
        `Could not reach the AI asset dev server at ${url}.`,
        "Make sure the demo dev server is running and that the assetApi URL matches it.",
        `Original error: ${errorMessage(error)}`
      ].join(" ")
    );
  }
}

async function responseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const body = JSON.parse(text) as { error?: string };
    return body.error ?? text;
  } catch {
    return text;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
