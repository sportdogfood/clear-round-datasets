# Clear Round Travel — Hub Knowledge
# Directory: /items/agents/hub-knowledge/
# Version: v1.0
# Last updated: 2025-09-18
# Purpose: Centralized knowledge for Hub structure, tone, and schema mapping.

Overview
--------
This folder contains the framework for building, curating, and presenting Hubs within Clear Round Travel. 
A Hub is a container that binds Events (time-based) and Venues (location-based) with curated Place Categories 
(Stay, Dine, Locale, Essentials, Extras). These documents provide structural scaffolds, insider tone guidelines, 
and schema alignment.

Contents
--------
- hub-skeleton.txt
  Visual hub skeleton with insider tone prompts; draft new hubs row by row.

- hub-sections-expanded.txt
  Deep dive into Stay, Dine, Locale, Essentials, Extras. Includes spotlight, links, CTA, and section image placeholders.

- hub-hierarchy.txt
  Nested hierarchy from Page → Hub → Entities → Place Categories → Sub-Entities. Includes schema terms (entities, attributes, knobs).

- hub-tone-rules.txt
  Persona, diction, and insider tone rules for hub content (equestrian + travel jargon).

- reference.json
  Machine-readable summary of the above documents. Can be provided to a chat runner to establish context quickly.

Usage
-----
- Use `.txt` docs when drafting or refining Hubs manually.
- Use `reference.json` to bootstrap context into a session with a chat runner.
- This folder is for hub-specific scaffolds; core schemas (event-rules, venue-rules, ingestion-rules) remain in /knowledge.
