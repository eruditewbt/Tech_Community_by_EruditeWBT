# Civilization Graph
*Powered by EruditeWBT*

This repo includes a **civilization-scale occupation graph** built from O*NET data and linked to **computing pillars**.

## What It Contains
- `exports/global_v2_web/graph.graphml`: open in Gephi/Cytoscape
- `exports/global_v2_web/nodes.jsonl` + `exports/global_v2_web/edges.jsonl`: stream-friendly exports
- `docs/assets/graph/graph.json`: web viewer dataset for GitHub Pages

## Node Types (V2)
- `occupation` (O*NET job titles)
- `industry_division` (industry divisions from metadata)
- `technology` / `tool` (O*NET technology skills + tools used)
- `computing_pillar` (Computing, Software, Data, AI, Cloud, Security, Networks, Automation)
- `root` (graph anchors)

## Edge Types (V2)
- `requires_skill`, `requires_knowledge`, `requires_ability` (optional layers; not included in the web build)
- `uses_tool`, `uses_technology`
- `works_in_industry`
- `related_occupation`
- `digitized_by`, `belongs_to`, `is_part_of`

## Web Viewer
Open the GitHub Pages site, then go to **Civilization Graph**.

## Rebuild / Upgrade
The source builder lives in the main workspace at:

- `knowledge_graph_engine/build_global_civilization_graph.py`

You can regenerate a fresh export locally and then copy outputs into this repo.

