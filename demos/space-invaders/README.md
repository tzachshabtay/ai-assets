# Space Invaders Demo

This demo uses `@ai-game-assets/phaser` to load prompt-aware hero and invader assets into a Phaser game.

Run it from the repository root:

```bash
export OPENAI_API_KEY=...
npm run build
npm run dev --workspace @ai-game-assets/demo-space-invaders
```

Open the URL printed by the dev server. It starts from `http://127.0.0.1:4177`, but automatically moves to the next available ports if the demo or asset API ports are already in use.

The asset designer uses real OpenAI image generation through `@ai-game-assets/dev`. It can regenerate options from the edited prompt, preview an option in the running game, promote it through the dev server, and restart to verify the manifest's active version persisted.

Optional environment variables:

- `OPENAI_IMAGE_MODEL`: defaults to `gpt-image-2`; the demo uses `background: "auto"` because this model rejects the explicit `transparent` background parameter.
- `AI_ASSET_API_PORT`: defaults to `3977`.
- `SPACE_INVADERS_DEMO_PORT`: defaults to `4177`.
