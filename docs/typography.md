# Typography system

Job Finder uses one semantic type scale across every workspace. Normal readable
application text is at least 14px. The only smaller token is reserved for text
inside constrained score marks and similarly tiny status UI.

| Token | Size | Default line height | Typical weight | Tracking | Color | Usage |
| --- | ---: | ---: | --- | --- | --- | --- |
| `--text-display` | 60px | 1.15 | 500 | Tight | `--ink` / `--lime` | Hero values and display statements |
| `--text-page-title` | 48px | 1.15 | 500 | Tight | `--ink` | Workspace titles |
| `--text-section` | 32px | 1.25 | 500–600 | Slightly tight | `--ink` | Major section headings |
| `--text-card-title` | 24px | 1.25 | 500–600 | Normal or slightly tight | `--ink` | Card and panel headings |
| `--text-body-large` | 18px | 1.55 | 400–600 | Normal | `--ink` | Leads and prominent summaries |
| `--text-body` | 16px | 1.55 | 400–700 | Normal | `--ink` | Body copy, form values, controls |
| `--text-body-small` | 14px | 1.55 | 400–700 | Normal | `--ink` / `--muted` | Compact body copy and metadata |
| `--text-label` | 14px | 1.25 | 600–800 | Optional uppercase tracking | `--ink` / `--green` | Labels, navigation, actions |
| `--text-helper` | 14px | 1.55 | 400–600 | Normal | `--muted` | Help and validation copy |
| `--text-caption` | 13px | 1.25–1.55 | 600–800 | Optional uppercase tracking | Semantic status color | Timestamps and compact badges |
| `--text-micro` | 10px | 1.15 | 700–800 | Uppercase tracking | Inherited | Constrained score-mark labels only |

## Readability rules

- Paragraphs, list items, metadata, helper text, navigation, and labels use at
  least 14px.
- Inputs, textareas, and selects use 16px text and a minimum 46px control
  height.
- Hierarchy comes from the semantic scale, weight, position, and spacing—not
  low-contrast text.
- `--muted` is reserved for secondary information and `--faint` remains dark
  enough for readable supporting copy.
- Status badges may use the 13px caption token. Diagnostic output and compact
  score marks are the only supported smaller-text exceptions.
