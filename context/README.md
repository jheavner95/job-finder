# Private context directory

Job Finder reads locally maintained career evidence and preferences from this
directory. Populated context files can contain a resume, portfolio evidence,
preferences, exclusions, and other sensitive information, so root-level
Markdown files in `context/` are ignored by Git.

Blank, non-personal templates are checked in under `context/example/`. For a new
local checkout:

```bash
cp context/example/*.md context/
```

Review and populate those local copies with verified source material. Unknown
values should remain `Unknown`. Never commit populated context files.
