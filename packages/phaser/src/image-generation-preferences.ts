import type { AiAssetDefinition, AiAssetGenerationSettings } from "@ai-game-assets/core";
import type { GeneratedDebugOption } from "./debug-client.js";

/** Keep a composition's next-generation model aligned with its latest regenerated tile. */
export function createImageGenerationSession(initial?: Pick<GeneratedDebugOption, "model" | "settings">) {
  let settings = optionSettings(initial);
  let regenerated = false;

  return {
    get settings(): AiAssetGenerationSettings | undefined {
      return settings ? { ...settings } : undefined;
    },
    record(option: GeneratedDebugOption | undefined): void {
      const generatedSettings = optionSettings(option);
      if (!generatedSettings?.model) return;
      settings = generatedSettings;
      regenerated = true;
    },
    applyTo(option: GeneratedDebugOption): GeneratedDebugOption {
      if (!regenerated || !settings?.model) return option;
      return {
        ...option,
        model: settings.model,
        settings: { ...option.settings, model: settings.model }
      };
    }
  };
}

function optionSettings(
  option: Pick<GeneratedDebugOption, "model" | "settings"> | undefined
): AiAssetGenerationSettings | undefined {
  if (!option) return undefined;
  const model = option.model ?? option.settings?.model;
  if (!model && !option.settings) return undefined;
  return { ...option.settings, ...(model ? { model } : {}) };
}

/** Manual frame and prompt edits retain the generation settings of those frames. */
export function tilesetAnimationSettingsForEdit(
  asset: AiAssetDefinition,
  animationKey: string,
  pending?: AiAssetGenerationSettings,
  generated?: AiAssetGenerationSettings
): AiAssetGenerationSettings | undefined {
  const settings = generated ?? pending ??
    asset.versions[asset.activeVersion]?.tilesetAnimations?.[animationKey]?.settings;
  return settings ? { ...settings } : undefined;
}
