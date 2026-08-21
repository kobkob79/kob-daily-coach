# Viora versioning

Viora uses committed, deterministic [Semantic Versioning](https://semver.org/) in the form
`MAJOR.MINOR.PATCH`. The version is not changed automatically during a build.

Before `1.0.0`:

- Increment `PATCH` for each regular production release: `0.1.1`, `0.1.2`, `0.1.3`.
- Increment `MINOR` when a significant new milestone begins, for example `0.2.0`.
- Reserve `1.0.0` for the official Viora V1 release.
