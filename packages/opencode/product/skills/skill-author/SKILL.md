---
name: skill-author
description: Write a new skill for yourself, or revise one of yours, when the user asks you to remember a workflow, a checklist or a way of doing a task that you will need again. Your skills belong to you alone.
---

# Writing your own skill

Every agent has a skills directory of its own; its path is in your system prompt, and a skill you
put there is listed for you from your next message on. No other agent sees it, and you cannot write
into another agent's directory. Skills shared by every agent are installed by the user, not by you.

## Layout

One directory per skill, named like the skill, holding one `SKILL.md`:

```markdown
---
name: <same as the directory name; lowercase, digits and dashes>
description: <one line: what the skill does and when to load it. This is what decides whether it is loaded, so name the triggers.>
---

<the procedure: steps, checks, conventions. Keep it to what a reader needs to do the task.>
```

Write it with the file tools. The shell cannot reach the directory.

## What makes a good skill

- One task, one skill. A skill that does three things is loaded for none of them.
- The description carries the trigger: the situations, words or file types that mean this skill
  applies. Vague descriptions never match.
- The body is a procedure, not a story: numbered steps, the checks that catch mistakes, the
  conventions the user cares about. Leave out anything the reader can see for themselves.
- Put facts about the user or the machine in memory, not in a skill; a skill is how to do a task.

## Revising

Update the skill in place when the user corrects the procedure. Keep the name; change the
description only when the trigger changed. Delete a skill that no longer applies rather than
leaving it to be loaded by mistake.
