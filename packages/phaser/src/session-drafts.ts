import { DEFAULT_IMAGE_MODEL } from "@ai-game-assets/core";
import type { AiAssetDefinition, AiAssetFormat, AiAudioFormat } from "@ai-game-assets/core";

export type DesignerDraftContext = {
  assetId: string;
  targetId?: string;
  animationKey?: string;
};

export function designerDraftContextKey(context: DesignerDraftContext): string {
  return JSON.stringify([context.assetId, context.targetId ?? null, context.animationKey ?? null]);
}

export type DesignerDraftValues = {
  prompt: string;
  width: string;
  height: string;
  frameCount: string;
  format: AiAssetFormat;
  model: string;
  audioFormat: AiAudioFormat;
  audioDuration: string;
  audioLoop: boolean;
  voiceText: string;
  tilePrompts: string[];
};

type Field = keyof DesignerDraftValues;
type DraftRecord = {
  values: DesignerDraftValues;
  edited: Set<Field>;
  savedVersion: string;
};

/** Detect edits against the displayed inputs, even if saved data has already been refreshed. */
export class DesignerDraftInputSnapshot {
  private values: Partial<DesignerDraftValues> = {};

  reset(values: Partial<DesignerDraftValues>): void {
    this.values = copyPartial(values);
  }

  capture(values: Partial<DesignerDraftValues>): Partial<DesignerDraftValues> {
    const changed = Object.fromEntries(Object.entries(values).filter(([field, value]) =>
      !equal(this.values[field as Field], value)
    )) as Partial<DesignerDraftValues>;
    this.values = { ...this.values, ...copyPartial(values) };
    return copyPartial(changed);
  }
}

/** Session-local form state. A saved version updates untouched fields without erasing later edits. */
export class DesignerSessionDrafts {
  private readonly records = new Map<string, DraftRecord>();

  resolve(context: DesignerDraftContext, defaults: DesignerDraftValues, savedVersion: string): DesignerDraftValues {
    const key = designerDraftContextKey(context);
    const record = this.records.get(key);
    if (!record) {
      this.records.set(key, { values: copy(defaults), edited: new Set(), savedVersion });
      return copy(defaults);
    }

    const changedVersion = record.savedVersion !== savedVersion;
    for (const field of Object.keys(defaults) as Field[]) {
      if (!record.edited.has(field) || (changedVersion && equal(record.values[field], defaults[field]))) {
        assign(record.values, field, defaults[field]);
        record.edited.delete(field);
      }
    }
    record.savedVersion = savedVersion;
    return copy(record.values);
  }

  update(context: DesignerDraftContext, values: Partial<DesignerDraftValues>): void {
    const record = this.records.get(designerDraftContextKey(context));
    if (!record) return;
    for (const field of Object.keys(values) as Field[]) {
      const value = values[field];
      if (value === undefined || equal(record.values[field], value)) continue;
      assign(record.values, field, value);
      record.edited.add(field);
    }
  }

  copyChanges(from: DesignerDraftContext, to: DesignerDraftContext): void {
    const source = this.records.get(designerDraftContextKey(from));
    const target = this.records.get(designerDraftContextKey(to));
    if (!source || !target) return;
    for (const field of source.edited) {
      if (target.edited.has(field)) continue;
      assign(target.values, field, source.values[field]);
      target.edited.add(field);
    }
  }
}

function copy(values: DesignerDraftValues): DesignerDraftValues {
  return { ...values, tilePrompts: [...values.tilePrompts] };
}

function copyPartial(values: Partial<DesignerDraftValues>): Partial<DesignerDraftValues> {
  return { ...values, ...(values.tilePrompts ? { tilePrompts: [...values.tilePrompts] } : {}) };
}

function equal(left: DesignerDraftValues[Field] | undefined, right: DesignerDraftValues[Field] | undefined): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

function assign<K extends Field>(values: DesignerDraftValues, field: K, value: DesignerDraftValues[K]): void {
  values[field] = (Array.isArray(value) ? [...value] : value) as DesignerDraftValues[K];
}

export function savedDesignerDraftValues(asset: AiAssetDefinition, animationKey?: string): DesignerDraftValues {
  const version = asset.versions[asset.activeVersion];
  const tileset = asset.tileset;
  const animation = tileset?.animations?.find((item) => item.key === animationKey);
  const tileCount = tileset
    ? Math.min(tileset.tileCount ?? tileset.columns * tileset.rows, tileset.columns * tileset.rows)
    : 0;
  const format = asset.settings?.format ?? "png";
  const animationSettings = animationKey ? version?.tilesetAnimations?.[animationKey]?.settings : undefined;
  return {
    prompt: animation?.prompt ?? asset.prompt,
    width: String(asset.frameGrid?.frameWidth ?? tileset?.tileWidth ?? asset.dimensions?.width ?? 1),
    height: String(asset.frameGrid?.frameHeight ?? tileset?.tileHeight ?? asset.dimensions?.height ?? 1),
    frameCount: String(animation?.frameCount ?? asset.frameGrid?.frameCount ??
      (asset.frameGrid ? asset.frameGrid.columns * asset.frameGrid.rows : tileset ? tileCount : 1)),
    format,
    model: animationSettings?.model ?? asset.settings?.model ?? DEFAULT_IMAGE_MODEL,
    audioFormat: asset.audioSettings?.format ?? "mp3",
    audioDuration: String(asset.audioSettings?.durationSeconds ?? version?.durationSeconds ?? ""),
    audioLoop: Boolean(asset.audioSettings?.loop),
    voiceText: version?.voiceSettings?.text ?? version?.voiceSettings?.previewText ??
      asset.voiceSettings?.text ?? asset.voiceSettings?.previewText ?? "",
    tilePrompts: animationKey
      ? animation?.tiles?.map((tile) => tile.prompt) ?? Array.from({ length: tileCount }, (_, index) => {
          const basePrompt = tileset?.tiles?.[index]?.prompt?.trim();
          return basePrompt
            ? `Keep this ${basePrompt} tile unchanged unless this animation needs it to move.`
            : "Keep this tile unchanged unless this animation needs it to move.";
        })
      : tileset?.tiles?.map((tile) => tile.prompt) ?? []
  };
}
