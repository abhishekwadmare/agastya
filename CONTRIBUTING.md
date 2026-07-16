# Contributing to Agastya

This is primarily a personal, single-maintainer project, but issues and
pull requests are welcome.

## Workflow

This repo follows [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow):

1. Branch off `main`, one logical change per branch.
2. Branch naming: `<type>/<issue-number>-<short-slug>` if there's a
   backing issue (e.g. `fix/18-workday-site-parsing`), or
   `<type>/<short-slug>` otherwise (e.g. `chore/bump-vite`).
3. Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `docs:`, `chore:`, etc.
4. Open a PR against `main` using the PR template - what/why, related
   issue, screenshots if the UI changed, how to verify.
5. CI (`.github/workflows/ci.yml`) runs `npm run build` on every PR - it
   must pass before merge.
6. Squash-merge, delete the branch.

## Filing issues

Bugs and feature ideas both go through GitHub Issues - that's the
project's backlog, there's no separate tracker. Use the issue templates
when they fit; a quick, loosely-detailed issue is still better than none.

## Local development

See the [README](./README.md#local-development) for running the
frontend, Worker, and scraper locally.

## Code style

No linter or formatter is currently enforced - match the style of the
surrounding code. Prefer editing existing files over creating new ones,
and avoid adding abstractions or config beyond what the change actually
needs.
