import type { AiAssetManifest, AiVoiceGenerationSettings } from "@ai-game-assets/core";
import { resolveTargetAssetId } from "@ai-game-assets/core";
import type {
  AiAssetDebugClient,
  GeneratedDebugOption,
  SaveDebugOptionResult
} from "./debug-client.js";

export type VoiceLineRegenerationPhase = "generation" | "promotion";

export type VoiceLineRegenerationProgress = {
  assetId: string;
  index: number;
  total: number;
  phase: VoiceLineRegenerationPhase;
};

export type VoiceLineRegenerationFailure = VoiceLineRegenerationProgress & {
  error: unknown;
  option?: GeneratedDebugOption;
};

export type VoiceLineRegenerationCancellation = {
  assetId: string;
  index: number;
  total: number;
  option?: GeneratedDebugOption;
};

export type VoiceLineRegenerationResult = {
  manifest: AiAssetManifest;
  promoted: SaveDebugOptionResult[];
  failures: VoiceLineRegenerationFailure[];
  cancelled?: VoiceLineRegenerationCancellation;
  manifestModuleSyncDeferred?: boolean;
  manifestModuleSyncError?: unknown;
};

export type VoiceLineRegenerationPlan = {
  baseVoiceAssetId: string;
  lineAssetIds: string[];
  missingTargetLineAssetIds: string[];
};

export type RegenerateAndPromoteVoiceLinesOptions = {
  manifest: AiAssetManifest;
  voiceAssetId: string;
  targetId?: string;
  client: Pick<AiAssetDebugClient, "generate" | "save"> &
    Partial<Pick<AiAssetDebugClient, "syncManifestModule">>;
  /** Stops before the next line, after any in-flight line has been saved. */
  signal?: AbortSignal;
  onProgress?(progress: VoiceLineRegenerationProgress): void;
  versionName?(assetId: string, index: number): string;
};

export function voiceLineRegenerationPlan(
  manifest: AiAssetManifest,
  voiceAssetId: string,
  targetId?: string
): VoiceLineRegenerationPlan {
  const voice = manifest.assets[voiceAssetId];
  const baseVoiceAssetId = resolveTargetAssetId(manifest, voiceAssetId, targetId);
  if (voice?.kind !== "voice") {
    return { baseVoiceAssetId, lineAssetIds: [], missingTargetLineAssetIds: [] };
  }

  const target = targetId ? manifest.targets?.[targetId] : undefined;
  const usesTargetSpecificVoice = baseVoiceAssetId !== voiceAssetId;
  const lineAssetIds: string[] = [];
  const missingTargetLineAssetIds: string[] = [];
  const seenLogicalAssetIds = new Set<string>();

  for (const link of Object.values(voice.linkedAnimationAssets ?? {})) {
    const logicalAssetId = link.assetId;
    if (seenLogicalAssetIds.has(logicalAssetId) || logicalAssetId === voiceAssetId) continue;
    seenLogicalAssetIds.add(logicalAssetId);

    const explicitTargetAssetId = target?.variants[logicalAssetId];
    const logicalAsset = manifest.assets[logicalAssetId];
    const explicitTargetAsset = explicitTargetAssetId
      ? manifest.assets[explicitTargetAssetId]
      : undefined;
    if (logicalAsset?.kind !== "voice-line" && explicitTargetAsset?.kind !== "voice-line") {
      continue;
    }

    if (usesTargetSpecificVoice && explicitTargetAsset?.kind !== "voice-line") {
      missingTargetLineAssetIds.push(logicalAssetId);
      continue;
    }

    const resolvedAssetId = explicitTargetAsset?.kind === "voice-line"
      ? explicitTargetAsset.id
      : resolveTargetAssetId(manifest, logicalAssetId, targetId);
    if (resolvedAssetId !== baseVoiceAssetId && !lineAssetIds.includes(resolvedAssetId)) {
      lineAssetIds.push(resolvedAssetId);
    }
  }

  return { baseVoiceAssetId, lineAssetIds, missingTargetLineAssetIds };
}

export function linkedVoiceLineAssetIds(
  manifest: AiAssetManifest,
  voiceAssetId: string,
  targetId?: string
): string[] {
  return voiceLineRegenerationPlan(manifest, voiceAssetId, targetId).lineAssetIds;
}

export function promotedVoiceId(
  manifest: AiAssetManifest,
  voiceAssetId: string
): string | undefined {
  const voice = manifest.assets[voiceAssetId];
  if (voice?.kind !== "voice") return undefined;

  const activeVersion = voice.versions[voice.activeVersion];
  return activeVersion?.voiceSettings?.voiceId ?? voice.voiceSettings?.voiceId;
}

export async function regenerateAndPromoteVoiceLines(
  options: RegenerateAndPromoteVoiceLinesOptions
): Promise<VoiceLineRegenerationResult> {
  const plan = voiceLineRegenerationPlan(
    options.manifest,
    options.voiceAssetId,
    options.targetId
  );
  const { baseVoiceAssetId, lineAssetIds } = plan;
  const voiceId = promotedVoiceId(options.manifest, baseVoiceAssetId);
  if (!voiceId) {
    throw new Error(
      `Voice "${baseVoiceAssetId}" needs a promoted base voice before its lines can be regenerated.`
    );
  }

  if (plan.missingTargetLineAssetIds.length > 0) {
    throw new Error(
      `Target "${options.targetId}" needs voice-line variants for: ` +
        plan.missingTargetLineAssetIds.join(", ")
    );
  }
  if (lineAssetIds.length === 0) {
    throw new Error(`Voice "${baseVoiceAssetId}" has no linked voice lines to regenerate.`);
  }

  let manifest = options.manifest;
  const promoted: SaveDebugOptionResult[] = [];
  const failures: VoiceLineRegenerationFailure[] = [];
  let cancelled: VoiceLineRegenerationCancellation | undefined;
  const batchStartedAt = Date.now();
  const reportProgress = (progress: VoiceLineRegenerationProgress) => {
    try {
      options.onProgress?.(progress);
    } catch {
      // Progress observers must never discard paid generation results.
    }
  };

  for (const [index, assetId] of lineAssetIds.entries()) {
    const line = manifest.assets[assetId];
    const activeVersion = line?.versions[line.activeVersion];
    const progress = {
      assetId,
      index,
      total: lineAssetIds.length
    };
    let generatedOption: GeneratedDebugOption;

    if (options.signal?.aborted) {
      cancelled = progress;
      break;
    }

    reportProgress({ ...progress, phase: "generation" });
    try {
      const voiceSettings: AiVoiceGenerationSettings = {
        ...activeVersion?.voiceSettings,
        ...line?.voiceSettings,
        voiceAssetId: baseVoiceAssetId,
        voiceId
      };
      const generated = await options.client.generate({
        assetId,
        prompt: line?.prompt ?? activeVersion?.prompt,
        count: 1,
        audioSettings: {
          ...activeVersion?.audioSettings,
          ...line?.audioSettings
        },
        voiceSettings
      });
      if (generated.length !== 1) {
        throw new Error(
          `Expected exactly one generated option for "${assetId}", received ${generated.length}.`
        );
      }
      generatedOption = generated[0]!;
    } catch (error) {
      if (options.signal?.aborted) {
        cancelled = progress;
        break;
      }
      failures.push({ ...progress, phase: "generation", error });
      continue;
    }

    reportProgress({ ...progress, phase: "promotion" });
    try {
      const saved = await options.client.save({
        assetId,
        versionName: options.versionName?.(assetId, index) ??
          `promoted-${batchStartedAt}-${index + 1}`,
        dataUrl: generatedOption.dataUrl,
        prompt: generatedOption.prompt,
        model: generatedOption.model,
        revisedPrompt: generatedOption.revisedPrompt,
        dimensions: generatedOption.dimensions,
        frameGrid: generatedOption.frameGrid,
        tileset: generatedOption.tileset,
        tilesetSourceDataUrl: generatedOption.tilesetSourceDataUrl,
        tilesetTransforms: generatedOption.tilesetTransforms,
        animations: generatedOption.animations,
        settings: generatedOption.settings,
        audioSettings: generatedOption.audioSettings,
        audioPlayback: generatedOption.audioPlayback,
        voiceSettings: generatedOption.voiceSettings,
        durationSeconds: generatedOption.durationSeconds,
        activate: true,
        notes: "Regenerated from the selected base voice with Regenerate all lines.",
        deferManifestModuleWrite: Boolean(options.client.syncManifestModule)
      });
      manifest = saved.manifest;
      promoted.push(saved);
    } catch (error) {
      failures.push({
        ...progress,
        phase: "promotion",
        error,
        option: generatedOption
      });
      // A save failure is commonly a storage or server outage. Stop here so a
      // broken promotion path cannot spend money generating the remaining lines.
      break;
    }
  }

  const hasPendingPaidOption =
    failures.some((failure) => Boolean(failure.option)) || Boolean(cancelled?.option);
  let manifestModuleSyncDeferred = false;
  let manifestModuleSyncError: unknown;
  if (options.client.syncManifestModule && promoted.length > 0) {
    if (hasPendingPaidOption) {
      manifestModuleSyncDeferred = true;
    } else {
      try {
        manifest = await options.client.syncManifestModule();
      } catch (error) {
        manifestModuleSyncError = error;
      }
    }
  }

  return {
    manifest,
    promoted,
    failures,
    cancelled,
    manifestModuleSyncDeferred: manifestModuleSyncDeferred || undefined,
    manifestModuleSyncError
  };
}
