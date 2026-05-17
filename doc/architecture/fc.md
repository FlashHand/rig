# rig fc — Aliyun Function Compute (placeholder)

> Status: Not started — 2026-05-17. Bo intends to add `rig fc *` subcommands for deploying / managing Aliyun Function Compute services. This file is a placeholder so the architecture tree is complete.

Spec will be written when work begins. Expected shape (subject to revision):

```
rig fc init                       # write fc.rig.json5 in current project
rig fc deploy [--env <name>]      # build + upload + invoke deploy
rig fc invoke <fn> [--params ...]
rig fc logs <fn> [-f]
rig fc list
rig fc rollback <fn> <version>
```

Auth: `~/.rig/config.json5` `fc:` block (Aliyun AK/SK or RAM credentials).
Per-project config: `<project>/fc.rig.json5` listing functions, runtime, triggers.
