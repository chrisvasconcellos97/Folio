// Shared metadata for account update types — used by UpdatesTab and the
// OverviewTab "Recent updates" block. The sparkline tick markers got ripped
// with Pipeline V2 (see CLAUDE.md "Ripped" section). Colors reuse existing C
// tokens so both themes resolve correctly.
import { C } from "./colors";

export var UPDATE_TYPES = [
  "catalog",
  "pricing",
  "integration",
  "product_launch",
  "training",
  "promo",
  "external_event",
  "other",
];

export var UPDATE_TYPE_LABELS = {
  catalog:        "Catalog",
  pricing:        "Pricing",
  integration:    "Integration",
  product_launch: "Product Launch",
  training:       "Training",
  promo:          "Promo",
  external_event: "External Event",
  other:          "Other",
};

// Each maps to a `C` token so light + dark both render correctly. Pick
// colors with semantic affinity (pricing red, promo green, etc.) but stay
// inside the existing token palette — no new hexes introduced.
export var UPDATE_TYPE_COLORS = {
  catalog:        C.blue,
  pricing:        C.red,
  integration:    C.purple,
  product_launch: C.accent,
  training:       C.yellow,
  promo:          C.green,
  external_event: C.textMuted,
  other:          C.textMuted,
};

export var IMPACT_OPTIONS = ["positive", "negative", "mixed", "unknown"];
export var IMPACT_LABELS = {
  positive: "Positive",
  negative: "Negative",
  mixed:    "Mixed",
  unknown:  "Unknown",
};
