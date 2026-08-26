# Vendored dependencies

This directory is committed to the Gateway repository on purpose.

Gateway is a WordPress plugin, not a standalone Composer project -- a site
installing it must never need to run `composer install` itself. The PHP
packages under this directory (Laravel's `illuminate/database` component,
which brings in Eloquent models, the Schema/migration builder, Carbon, and a
handful of Symfony/PSR support packages as transitive dependencies -- see the
top-level `README.md`'s "Laravel Models (Illuminate/Eloquent)" section for
the full list and rationale) are fully installed and checked into git here,
exactly as a real `composer install` produced them, plus two cleanup passes
that a from-source install doesn't otherwise get:

- Every package's embedded `.git` directory (a side effect of Composer
  falling back to cloning from source rather than downloading a GitHub
  zipball) was removed -- it's history, not runtime code.
- Every package's own `.gitattributes` `export-ignore` rules (tests,
  `.github/` CI config, lint/docs tooling -- normally stripped by GitHub's
  own dist-zipball generation, which a from-source clone doesn't apply) were
  applied by hand, so `vendor/` matches what a production `composer install`
  would actually ship.

**These classes are shipped unprefixed**, under their real `Illuminate\*`,
`Symfony\*`, `Carbon\*`, etc. namespaces -- a deliberate choice, not an
oversight. If another active plugin on the same WordPress site bundles a
different, incompatible version of one of these same packages, PHP will
raise a fatal "class already declared" error. See the main `README.md` for
the full trade-off this decision accepts.

## Updating

`composer.json` / `composer.lock` at the repo root describe what's vendored.
To bump a version: run `composer update` locally (Composer itself is a
dev-time tool here, not something end users ever invoke), then repeat both
cleanup passes above before committing the result. Do not hand-edit anything
under this directory -- treat it as generated output.
