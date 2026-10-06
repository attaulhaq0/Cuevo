# Microsoft Foundry image settings for Cuevo UI/UX

The image model creates design references. Cuevo's frontend remains Next.js, React and TypeScript. These settings belong to local design tools and never enter the browser or the application API environment.

3 October Sora clarification: `G:/E Deviser Website/scripts/foundry-sora.mjs` implements the dedicated Foundry Sora 2 asset workflow. Its `.env.local` has configured `AZURE_SORA_ENDPOINT`, `AZURE_SORA_DEPLOYMENT` and `AZURE_SORA_API_KEY`; only presence was inspected, with no key output/copy or live request. Saved completed job/media records confirm earlier Website generation. The founder authorizes using that setup for reviewed character assets through private design-tool memory; do not import Website app code into Cuevo, commit its key or add a browser/runtime generation dependency. Exact current service/version availability remains separately unverified. See the [progression/asset boundary](../architecture/character-progression-system.md).

## Where to enter the settings

Open `.local/design-concepts/foundry-image.env` in the isolated design worktree. This file is ignored by Git and has clearly labelled fields. Its absolute path in this chat is `C:/Users/hp/.codex/worktrees/cuevo-design-system/Cuevo/.local/design-concepts/foundry-image.env`.

| Label in the file | What to enter |
|---|---|
| `CUEVO_IMAGE_ENDPOINT` — Foundry resource endpoint | Copy the endpoint from the resource's **Keys and Endpoint** screen. The current configured resource uses `https://edeviser-sweden-resource.services.ai.azure.com/openai/v1`. Change this if the image deployment is in another resource. Use its HTTPS OpenAI-compatible endpoint. |
| `CUEVO_IMAGE_DEPLOYMENT` — Image deployment name | The exact name shown under model deployments. The founder supplied `gpt-image-2.5-sunburst`; it is already filled in. A friendly model display title is not the deployment name. |
| `CUEVO_IMAGE_API_KEY` — Foundry API key | Paste the key locally between the quotes only when necessary. Leave `""` to reuse the `AZURE_OPENAI_API_KEY` already configured on this computer. Never paste the key into chat. |
| `CUEVO_IMAGE_QUALITY` — Image quality | `high` for detailed UI concepts. Change only to a quality supported by the deployed API and installed design tool. |

The key authenticates the Azure resource; the deployment name selects the image model within that resource. A separate model-specific key is not required when the existing credential is valid for the same resource. A deployed image model in another resource needs that resource's endpoint and a valid credential.

The local runner reads these labelled settings and passes the selected credential to the Image Gen process only. It does not rewrite Codex configuration, root `G:/Cuevo` environment files or product secrets. There is no `NEXT_PUBLIC_*` image key setting.

The founder requires approval before every new generation/edit set. Successful key setup is not approval to generate. Present the [concept set](2026-concept-generation-brief.md), model, surfaces and image count first; issue only the approved requests. Additional refinements and mobile/RTL/detail images need approval for their own concrete scope.

## Verification and recovery

- A model catalog entry confirms the model exists in the catalog; it does not prove a deployment is callable.
- A successful image-generation response and valid saved image prove this deployment works with the selected endpoint and credential.
- `DeploymentNotFound`: confirm the exact deployment name and that it belongs to the endpoint's resource. A recently created deployment may need time to become available.
- `401`/`403`: check that the key belongs to that resource and has permitted access. Do not expose it in screenshots or logs.
- `429`: respect the provider retry information and avoid repeated batches.
- Unsupported size/quality/endpoint: use the exact documented API support for `gpt-image-2.5-sunburst`; never downgrade the model silently.

Only product/design requirements and deliberately synthetic concept content go into prompts. Do not send customer data, pupil evidence, private files, access tokens, database credentials or academic authority to the image model. Concepts remain proposed designs until reviewed and faithfully implemented with accessible real controls.

## Source and plan

Microsoft's [image-generation guide](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/dall-e?view=foundry-classic) describes endpoint/key/deployment separation, generation/editing and supported model settings. Its current model table includes `gpt-image-2.5-sunburst`; check the exact API response before claiming feature support.

See the [Cuevo UI transformation proposal](../superpowers/specs/2026-10-01-cuevo-ui-transformation-design.md). This setup document describes tooling, not a new product/domain source or a claim that the redesign is complete.
