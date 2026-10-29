---
"@console/server": minor
"@console/web": patch
---

# Retire duplicate backend adapters

Remove the unused backend `/v1/backends` registry/proxy and the duplicate `read_file`,
`write_file` and `run_command` tools. The web registry is the sole connection path and Pi's
read/write/edit/bash are the canonical coding tools. Keep project resource loading.

This intentionally breaks old API/tool names. No aliases or saved-task migration are provided;
existing database files and history remain untouched. Select
installed native tools for an idle conversation before new work. In-flight legacy tasks are unsupported.

Reuse native tool assembly and child-agent inheritance, share tool-selection calculations, and remove
repeated project-path validation and obsolete prompt migration alongside direct host execution.
