---
name: small-cli-packager
description: Build and package small command-line utilities, generators, converters, and local automation tools. Use when the user asks for a CLI, command-line tool, scriptable utility, standalone public repo, monorepo project, or generated-output workflow that needs safe flags, tests, README truth-in-packaging, ignored artifacts, and a clear handoff.
---

# Small CLI Packager

Use this skill to turn a small tool idea into a usable, repeatable CLI without hiding local assumptions or generated artifacts.

## Workflow

1. Define the CLI contract before coding.
   - Identify required inputs, output files, default behavior, and the user-provided smoke example.
   - Add explicit opt-in flags for destructive, expensive, private, large, remote, or irreversible actions.
   - Prefer deterministic flags for generators: `--seed`, `--width`, `--height`, `--out`, `--format`, `--preset`, or equivalent.
   - Make `--help` useful enough that a fresh clone can run the tool.

2. Choose the smallest fitting stack.
   - Prefer Go for simple single-binary CLIs.
   - Prefer Python for image, media, document, data, or ML-adjacent tools.
   - Prefer Node only when the tool naturally depends on the JS/web ecosystem or an existing JS project.
   - Reuse the repo's current package manager, test runner, and style before adding new tooling.

3. Place and package honestly.
   - In `projects-monorepo`, put normal projects under `projects/<project-name>/`.
   - If the user asks for a standalone public repo or submodule, keep the CLI self-contained and keep the monorepo link thin.
   - Do not commit generated samples, caches, large outputs, private files, or machine-specific artifacts unless there is a clear reason and the README says why.
   - Align `.gitignore` with the README's claims.

4. Implement the working surface first.
   - Keep the command shape stable and focused.
   - Put pure transformation/generation logic behind functions that tests can call without shelling out.
   - Keep UI polish, extra presets, package publishing, installers, and cloud features out of the first pass unless requested.

5. Validate with real commands.
   - Run `--help`.
   - Run the user's requested example end to end.
   - Add focused tests for parsing, core logic, and output naming.
   - For generated media, verify file existence plus cheap structural facts such as dimensions, format, non-empty bytes, or parseability.
   - If a dependency, credential, GPU, local app, or existing cache is required, document it instead of implying a fresh clone will work unaided.

6. Finish with truth in packaging.
   - README should say what works, how to install/run, how to regenerate important outputs, what is intentionally not included, and which commands were verified.
   - Examples should be reproducible from committed files unless clearly marked as local/generated.
   - Final response should include the CLI command, output locations, and validation commands.

## Review Checklist

- `--help` describes real flags and defaults.
- The smoke example succeeds from a fresh shell in the project directory.
- Tests cover the core behavior without relying on hidden local state.
- Generated outputs are ignored or deliberately committed with README explanation.
- The README does not imply production readiness, publishing, or platform support that was not built and verified.
- Safe defaults prevent accidental overwrites, private uploads, remote writes, or expensive runs.
