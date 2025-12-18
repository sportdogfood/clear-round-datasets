{
  "file": "expeditor-contract.json",
  "version": "v2025-12-18-expeditor-01",
  "street": "blog",
  "house": "cp:2",
  "role": "exp",
  "purpose": [
    "Fetch-neutral shaping: convert raw Rows datasets into lane-safe input bins",
    "Normalize null/empty deterministically to the HARD sentinel (\"could-not-verify\")",
    "Route C-family and P-family datasets into numbered bins (c_in_N, p_in_N)",
    "Produce NO narrative, NO inference, NO enrichment"
  ],
  "global_constraints": {
    "no_prose": true,
    "no_inference": true,
    "no_external_lookup": true,
    "no_cross_lane_data": true,
    "input_is_authoritative": true,
    "schema_is_fixed": true,
    "empty_is_safer_than_guessing": true
  },
  "inputs": {
    "job_definition": {
      "required": true,
      "read_only": true,
      "required_fields": ["job_id", "street", "house", "run_order", "datasets", "paths", "global_rules"]
    },
    "datasets_by_role": {
      "required": true,
      "read_only": true,
      "shape": {
        "any_role_key": {
          "role_key": "string",
          "items": "array"
        }
      }
    }
  },
  "normalization_rules": {
    "string_fields": {
      "null": "could-not-verify",
      "empty_string": "could-not-verify",
      "whitespace_only": "could-not-verify"
    },
    "numeric_fields": {
      "invalid": null
    },
    "arrays": {
      "missing": [],
      "null": []
    },
    "objects": {
      "missing": {}
    }
  },
  "dataset_family_rules": {
    "family_C": {
      "match_by_domains_all": ["event", "venue", "city_season"],
      "description": "Collection datasets"
    },
    "family_P": {
      "match_by_domains_all": ["stay", "dine", "essentials", "locale"],
      "description": "Places datasets"
    },
    "ordering_rule": {
      "strategy": "preserve_job_definition_datasets_order",
      "tie_breaker": "role_key_lex"
    }
  },
  "run_order_binding": {
    "required_bins_are_derived_from_run_order": true,
    "lane_key_patterns": {
      "c_pass_research_lane": "^cr([0-9]+)$",
      "p_pass_research_lane": "^pr([0-9]+)$"
    },
    "bin_patterns": {
      "c_input_bin": "c_in_{n}",
      "p_input_bin": "p_in_{n}"
    },
    "behavior": {
      "produce_only_bins_needed_by_run_order": true,
      "if_lane_requests_pass_n_but_dataset_missing": "halt"
    }
  },
  "output_bins": {
    "c_in_n": {
      "bin_name_pattern": "c_in_{n}",
      "role": "collection_input",
      "domains": ["event", "venue", "city_season"],
      "shape": {
        "job_id": "string",
        "street": "string",
        "house": "string",
        "lane": "string",
        "pass_n": "number",
        "creation_id": "string",
        "event_identity": "object",
        "maps_anchor": "object",
        "collection_input": {
          "event_notes": "string",
          "venue_notes": "string",
          "city_season_notes": "string"
        },
        "source_log": "array"
      },
      "notes": [
        "event_identity and maps_anchor are assembled/selected by EXP from the C dataset content if present.",
        "If identity/anchor cannot be assembled from provided inputs, EXP MUST populate required keys with \"could-not-verify\" (or null where specified by normalization rules) and halt only if required by error_handling."
      ]
    },
    "p_in_n": {
      "bin_name_pattern": "p_in_{n}",
      "role": "places_input",
      "domains": ["stay", "dine", "essentials", "locale"],
      "shape": {
        "job_id": "string",
        "street": "string",
        "house": "string",
        "lane": "string",
        "pass_n": "number",
        "creation_id": "string",
        "places_input": "object",
        "source_log": "array"
      },
      "notes": [
        "places_input is a lane-safe object derived only from the P dataset content.",
        "EXP MUST NOT add new places, businesses, distances, or attributes beyond what exists in the P dataset."
      ]
    }
  },
  "shaping_rules": {
    "c_dataset_to_c_in_n": {
      "allowed_operations": [
        "select/parse lane-safe fields from dataset content",
        "normalize null/empty to sentinel",
        "assemble event_identity/maps_anchor only from provided dataset content",
        "assemble collection_input.{event_notes,venue_notes,city_season_notes} only from provided dataset content",
        "emit source_log describing what fields/rows were used"
      ],
      "forbidden_operations": [
        "infer missing identity",
        "upgrade prestige or add ratings",
        "invent venue/city specifics",
        "merge P-family content into C-family bins"
      ]
    },
    "p_dataset_to_p_in_n": {
      "allowed_operations": [
        "select/parse lane-safe places_input from dataset content",
        "normalize null/empty to sentinel",
        "emit source_log describing what fields/rows were used"
      ],
      "forbidden_operations": [
        "invent businesses or amenities",
        "add distances/times",
        "expand locale beyond provided rows",
        "merge C-family content into P-family bins"
      ]
    }
  },
  "source_log_rules": {
    "emit_source_log": true,
    "each_entry_shape": {
      "source_label": "string",
      "source_ref": "string",
      "notes": "string"
    },
    "minimum_entries": 1
  },
  "forbidden_behaviors": [
    "adding derived fields",
    "renaming keys",
    "dropping required keys",
    "creating prose or summaries",
    "repairing data semantically",
    "guessing missing values",
    "merging domains across families"
  ],
  "error_handling": {
    "missing_required_job_definition_field": {
      "action": "halt",
      "error_code": "EXP_JOBDEF_INVALID"
    },
    "missing_required_dataset_for_requested_pass": {
      "action": "halt",
      "error_code": "EXP_PASS_DATASET_MISSING"
    },
    "schema_violation_in_emitted_bin": {
      "action": "halt",
      "error_code": "EXP_SCHEMA_VIOLATION"
    },
    "unmatched_dataset_domains": {
      "action": "halt",
      "error_code": "EXP_DATASET_FAMILY_UNMATCHED"
    }
  },
  "guarantees": [
    "All downstream lanes receive schema-stable, lane-safe inputs (c_in_N / p_in_N)",
    "All missing values are explicitly normalized (\"could-not-verify\" or [] / {} / null per rules)",
    "No lane receives data it is not contractually allowed to see",
    "Failure is explicit and early"
  ]
}
