import type {
  AiAssetDefinition,
  AiAssetGenerationSettings,
  AiAssetManifest,
  AiAssetTileset,
  AiAssetVersion,
  AiAudioPlaybackSettings,
  AiAudioGenerationSettings,
  AiVoiceGenerationSettings
} from "@ai-game-assets/core";

export type GenerateDebugOptionsRequest = {
  assetId: string;
  prompt?: string;
  count?: number;
  references?: Array<{
    name: string;
    dataUrl: string;
  }>;
  dimensions?: {
    width: number;
    height: number;
  };
  frameCount?: number;
  tileset?: Pick<
    AiAssetTileset,
    "tileWidth" | "tileHeight" | "tileCount" | "tiles"
  > & Partial<Pick<AiAssetTileset, "columns" | "rows">>;
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
  tileset?: AiAssetTileset;
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

export type GenerateTilesetAnimationRequest = {
  assetId: string;
  animationKey: string;
  prompt?: string;
  count?: number;
  baseDataUrl?: string;
  styleGuide?: DebugStyleGuideDraft;
};

export type GeneratedTilesetAnimationCandidate = {
  index: number;
  animationKey: string;
  frames: GeneratedDebugOption[];
};

export type SaveTilesetAnimationRequest = {
  assetId: string;
  animationKey: string;
  frames: string[];
  versionName?: string;
  notes?: string;
};

export type SaveTilesetAnimationResult = {
  manifest: AiAssetManifest;
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
  file: string;
  filePath: string;
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
  tileset?: GeneratedDebugOption["tileset"];
  animations?: GeneratedDebugOption["animations"];
  settings?: AiAssetGenerationSettings;
  audioSettings?: AiAudioGenerationSettings;
  audioPlayback?: AiAudioPlaybackSettings;
  voiceSettings?: AiVoiceGenerationSettings;
  durationSeconds?: number;
  activate?: boolean;
  notes?: string;
};

export type SaveDebugOptionResult = {
  manifest: AiAssetManifest;
  asset: AiAssetDefinition;
  versionName: string;
  version: AiAssetVersion;
  file: string;
  filePath: string;
};

export type DeleteDebugVersionRequest = {
  assetId: string;
  versionName: string;
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

export type EnsureTargetVariantRequest = {
  targetId: string;
  assetId: string;
};

export type EnsureTargetVariantResult = {
  manifest: AiAssetManifest;
  assetId: string;
};

export type AiAssetDebugClientRequestOptions = {
  signal?: AbortSignal;
};

export class AiAssetDebugClient {
  readonly endpoint: string;

  constructor(endpoint = "http://127.0.0.1:3977") {
    this.endpoint = endpoint.replace(/\/$/, "");
  }

  assetUrl(file: string): string {
    if (
      file.startsWith("data:") ||
      file.startsWith("blob:") ||
      /^https?:\/\//i.test(file)
    ) {
      return file;
    }

    return `${this.endpoint}/${file.replace(/^\//, "")}`;
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

  async generateTilesetAnimationStream(
    request: GenerateTilesetAnimationRequest,
    onCandidate: (candidate: GeneratedTilesetAnimationCandidate) => void,
    options: AiAssetDebugClientRequestOptions = {}
  ): Promise<GeneratedTilesetAnimationCandidate[]> {
    const url = `${this.endpoint}/__ai-assets/generate-tileset-animation-stream`;
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

    if (!response.body) {
      throw new Error("Tileset animation generation did not return a response stream.");
    }

    const generated: GeneratedTilesetAnimationCandidate[] = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const consumeLine = (line: string) => {
      if (!line.trim()) return;

      const event = JSON.parse(line) as
        | { type: "option"; option: GeneratedTilesetAnimationCandidate }
        | { type: "error"; error: string }
        | { type: "done" };

      if (event.type === "option") {
        const candidate = {
          ...event.option,
          frames: [...event.option.frames].sort((left, right) => left.index - right.index)
        };
        generated.push(candidate);
        onCandidate(candidate);
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

  async saveTilesetAnimation(
    request: SaveTilesetAnimationRequest
  ): Promise<SaveTilesetAnimationResult> {
    const url = `${this.endpoint}/__ai-assets/save-tileset-animation`;
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

    return response.json() as Promise<SaveTilesetAnimationResult>;
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

  async save(request: SaveDebugOptionRequest): Promise<SaveDebugOptionResult> {
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

    return response.json() as Promise<SaveDebugOptionResult>;
  }

  async deleteVersion(request: DeleteDebugVersionRequest): Promise<AiAssetManifest> {
    const url = `${this.endpoint}/__ai-assets/delete-version`;
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

    const body = await response.json() as { manifest: AiAssetManifest };
    return body.manifest;
  }

  async ensureTargetVariant(
    request: EnsureTargetVariantRequest
  ): Promise<EnsureTargetVariantResult> {
    const url = `${this.endpoint}/__ai-assets/target-variant`;
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

    return response.json() as Promise<EnsureTargetVariantResult>;
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
