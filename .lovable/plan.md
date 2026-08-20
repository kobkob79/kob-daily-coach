# Secure Production Secret Configuration for Viora

## Current state (verified)

- `OPENAI_API_KEY` — already exists as a runtime secret in this project.
- `VIORA_AI_PROVIDER` — not yet configured.
- Backend: Lovable Cloud (managed Supabase) is active on this project.

## Exact secure UI path

For a Lovable Cloud project, runtime secrets are configured at:

```text
Project Settings → Secrets
```

Not under Workspace Settings (those are Build Secrets) and not inside the Lovable Cloud/backend panel.

## Steps to add / update the two values

1. Open the Lovable editor for this project.
2. In the left sidebar, open **Project Settings**.
3. Select the **Secrets** tab.
4. Add or update each secret exactly as follows:

   | Secret name        | Value / format expected by the app                          |
   |--------------------|-------------------------------------------------------------|
   | `OPENAI_API_KEY`   | `sk-...` (OpenAI API key)                                   |
   | `VIORA_AI_PROVIDER`| `openai`                                                    |

5. Save. The values are encrypted and injected into server functions as `process.env.OPENAI_API_KEY` and `process.env.VIORA_AI_PROVIDER`.

## Why the Secrets tab may not be visible

If Project Settings does not show a **Secrets** section, the most common causes are:

- The project is opened in a view/role that does not expose runtime secrets (for example, a guest or limited collaborator role).
- The project is not fully provisioned with Lovable Cloud yet, even though the backend binding exists.
- The UI is cached; a hard refresh of the Lovable editor can repopulate the sidebar.

## Recommended next step

Since `OPENAI_API_KEY` already exists, only `VIORA_AI_PROVIDER=openai` needs to be added. If the **Secrets** tab is genuinely unavailable in your account view, the secure fallback is to contact Lovable support from the editor so they can confirm the account role or expose the tab — do not paste the API key into chat or any other field.

No code changes are required; the app already reads these values inside server functions (`src/lib/advisor-core/server/config.server.ts` and the OpenAI provider path).
