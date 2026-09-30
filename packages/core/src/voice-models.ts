/** The ElevenLabs speech model used when a voice line does not pin its own model. */
export const DEFAULT_VOICE_LINE_MODEL = "eleven_v4";

/** Speech models offered by the asset designer. Explicit custom models remain supported. */
export const VOICE_LINE_MODELS = [
  {
    id: DEFAULT_VOICE_LINE_MODEL,
    label: "Eleven v4",
    description: "Expressive speech with voice direction"
  },
  {
    id: "eleven_v3",
    label: "Eleven v3",
    description: "Expressive speech with audio tags"
  },
  {
    id: "eleven_multilingual_v2",
    label: "Eleven Multilingual v2",
    description: "Multilingual speech"
  }
] as const;
