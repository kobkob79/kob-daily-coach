# Viora environment registry

This registry is the authoritative identity check for Viora operations. Project names are labels only and must never be used to identify an environment.

## Environment identities

| Environment    | Project ref            | Public application                    | Management owner and allowed path                                                                                                                                                         |
| -------------- | ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production     | `dyzfauesfqzwgaunfagk` | `https://kob-daily-coach.lovable.app` | Lovable Cloud owns the production management path. Use the linked Lovable project and its managed backend workflow only after the production guard passes.                                |
| Non-production | `hvrdnezixxdkpjgroezn` | None established                      | May be inspected or managed only through an explicitly targeted Supabase management connection or CLI session, after confirming this exact ref and the intended non-production operation. |
| Non-production | `basaxxfmccdgisputfma` | None established                      | May be inspected or managed only through an explicitly targeted Supabase management connection or CLI session, after confirming this exact ref and the intended non-production operation. |

The current Supabase OAuth connector does not expose the production backend. It must not be used to infer, inspect, or manage production. A project named `viora`, `Viora`, or any similar label is not proof of identity.

## Required preflight

Before any SQL execution, migration, publish, or deploy:

1. Identify the requested environment by its exact project ref, not by project name.
2. For a production operation, run `node scripts/verify-viora-environment-target.mjs` from the repository root and require exit code `0`.
3. Confirm that the management path matches the registry: Lovable Cloud for production; an explicitly targeted Supabase connection or CLI session for either listed non-production ref.
4. Confirm that the operation itself is separately authorized. Passing the identity guard does not authorize a mutation.

## Stop conditions

Stop before SQL, migration, publish, or deploy when any of these is true:

- the project ref is missing;
- repository or environment evidence contains conflicting refs;
- the target is `hvrdnezixxdkpjgroezn` or `basaxxfmccdgisputfma` for a production operation;
- a production operation is being routed through the Supabase OAuth connector;
- the target was selected from a project name, display name, organization name, URL label, or remembered association instead of an exact ref;
- the live frontend, deployment target, repository configuration, and requested environment cannot be reconciled;
- the verifier returns a non-zero exit code;
- credentials appear in tracked configuration or would need to be displayed to continue.

When stopped, report the conflicting evidence and obtain explicit review. Do not “fix” identity by editing configuration, rotating credentials, migrating, publishing, or deploying as part of the verification step.

## Guard scope

`scripts/verify-viora-environment-target.mjs` is read-only. It reads only recognized, non-secret project-ref and Supabase-URL settings from the process environment and repository configuration. It performs no network requests, SQL, migrations, publication, deployment, or other mutation.
