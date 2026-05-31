# Repository Instructions

This repository is the BridgePoint Shopify app. Prefer existing app patterns and keep release-facing changes tightly scoped.

## Shopify AI Toolkit

- Keep `shopify-plugin@shopify-ai-toolkit` enabled for this repository. The repo-local Codex config also keeps `shopify-dev-mcp` available.
- For Shopify-specific implementation, review, or release work, use the Shopify AI Toolkit before relying on memory.
- Call `learn_shopify_api` first for the relevant surface and reuse its `conversationId` for follow-up Shopify tools.
- Use `use-shopify-cli` context for app config, extension config, Shopify CLI, deploy, and validation workflow questions.
- Use `admin` context for Admin GraphQL design, and validate generated Admin GraphQL with `validate_graphql_codeblocks`.
- Use the relevant Polaris or extension context when changing App Home or UI extension code, and validate generated Shopify component code with `validate_component_codeblocks`.
- Use `app-store-review` context before release-readiness or App Store submission checks.

## Project Checks

- Main config: `shopify.app.bridgepoint.toml`
- Development command: `npm run dev:bridge`
- Release config validation: `npm run release:validate-config`
- Release environment precheck: `npm run release:precheck`
- Full static verification: `npm test`
