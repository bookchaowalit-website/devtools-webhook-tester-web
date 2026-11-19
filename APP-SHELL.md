# App shell

The shared calm, Apple-like look for list-style apps (services, todos, notes, reminders,
habits, goals). Started 2026-11-13 with marketing-services-web as the pilot; todo-board was second, reminders third; checklists (a content library, no sidebar) fourth, notes fifth; journal (read-only, single column) sixth; this app (sidebar lists like services) is the seventh. Each app is its own repo, so the
shell is copied in, not installed: take `app/app-shell.css` and `components/app-shell.tsx`.

## Rules

- **Lists on the left, one list on the right.** The sidebar shows every list with its count;
  on phones it becomes a scrollable row of pills above the list.
- **One filled button:** the "New …" action. Everything else is a plain text button.
- **Composer opens in place** at the top of the list, focuses its first field, and closes on
  Add or Cancel. Add stays disabled until the required field has text.
- **Rows:** title, one line of detail, a status pill (text + tint, never colour alone), and
  a plain action named after the item (`aria-label="Remove …"`).
- **Removing is undoable** for a few seconds (toast with Undo); no confirm dialogs.
- **Empty states say what to do next**, and differ for "nothing yet" and "nothing matches".
- **Floor:** text ≥ 12px, controls ≥ 44px, 3px focus ring, 4.5:1 contrast in light and dark
  (placeholders included), 3:1 for input edges (--as-field-line), no horizontal scroll at 320px.

## Pieces

| Piece | Where |
|---|---|
| Tokens `--as-*` (light + dark), top bar, sidebar, composer, segmented control, rows, pills, toast, footer | `app/app-shell.css` |
| `AppTop`, `AppFoot`, `ListButton`, `Pill`, `PlusIcon` | `components/app-shell.tsx` |

Put the font variable on `<html>` (not `<body>`): the tokens are defined on `:root`, so a font
variable set lower down never reaches them.

## Moving an app onto the shell

1. Copy the two files; import `./app-shell.css` from `globals.css` and drop the old theme.
2. Keep the app's `lib/` logic and storage key unchanged so saved data still loads.
3. Rebuild the page as top bar → sidebar lists → head (title, count, search, New) → composer →
   list or empty state → note → footer.
4. Update the render test; screenshot 320 / 375 / 768 / 1440 in light and dark, once with the
   composer open.
