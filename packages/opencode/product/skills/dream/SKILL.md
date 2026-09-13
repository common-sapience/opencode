---
name: dream
description: Reflective consolidation pass over the shared memory directory — merge duplicates, resolve contradictions, convert relative dates to absolute ones, prune the index back under its limit. Run it when the host asks for it, or when the index has reached its size limit.
metadata:
  index_max_lines: 200
  index_max_bytes: 25000
  index_line_max_chars: 150
---

# Memory consolidation

You are doing a reflective pass over what the agents on this machine have learned about this user and
their work. The goal: the next session should orient quickly — who the user is, what they are working
on, how they want things done — without asking again.

The memory directory is this session's working directory, and it is also named by
`HARNESS_MEMORY_DIR`. The `memory` skill defines its layout, the file format and the memory types;
this pass does not change any of that. Address files by their plain names: nothing outside the
working directory is readable or writable in this pass, and only markdown files inside it are.

Run the four phases in order.

## Phase 1 — Take stock

List the memory directory and read `MEMORY.md`. Read every memory file. Note which ones overlap,
which look stale, which are thin, and which index lines point at files that are gone.

## Phase 2 — Merge duplicates

When two or more files describe the same person, preference, project, or decision, combine them into
one. Keep the richer file's path and slug so existing `[[name]]` links still resolve, fold the other
file's detail into it, delete the file that went away, and repoint any `[[name]]` link that named it.

## Phase 3 — Resolve contradictions and fix dates

When two memories disagree, the later one wins: keep it and delete the superseded claim, rather than
recording both. Use each file's content and the order the facts were learned to decide which is
later; if you genuinely cannot tell, keep the one that matches what you can observe on the machine
now.

Convert every relative time reference to an absolute date — "next week", "this quarter", "by Friday",
"yesterday" become dates — so the memory stays readable later. Retire a memory whose whole content
was a date that has passed and whose work is done; fold the lasting takeaway into a durable memory
first if there is one.

Separate the durable from the dated as you go. Preferences, working style, relationships and
recurring workflows are durable — keep and sharpen them. Specific deadlines and one-off tasks are
dated. Drop anything that merely restates what could be re-derived by reading the machine.

## Phase 4 — Prune the index

Rewrite `MEMORY.md` so it is back under `index_max_lines` lines and `index_max_bytes`, with one line
per memory under `index_line_max_chars`: `- [Title](file.md) — one-line hook`. No frontmatter, no
memory content.

- Remove pointers to memories that no longer exist.
- Shorten lines that carry detail belonging in the topic file.
- Add pointers for memory files that are missing one.
- If the index is still over the limit after that, merge the weakest remaining memories rather than
  dropping pointers: a memory with no index line is a memory nobody will find.

Finish with a short report: how many files you read, merged, rewrote and deleted, which
contradictions you resolved, and the index's final line and byte count.
