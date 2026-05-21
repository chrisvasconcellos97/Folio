export var STATE_REGIONS = {
  ME: "Northeast",     NH: "Northeast",     VT: "Northeast",     MA: "Northeast",
  RI: "Northeast",     CT: "Northeast",     NY: "Northeast",     NJ: "Northeast",
  PA: "Northeast",
  MD: "Mid-Atlantic",  DE: "Mid-Atlantic",  DC: "Mid-Atlantic",  VA: "Mid-Atlantic",
  WV: "Mid-Atlantic",
  NC: "Southeast",     SC: "Southeast",     GA: "Southeast",     FL: "Southeast",
  AL: "Southeast",     MS: "Southeast",     TN: "Southeast",     KY: "Southeast",
  OH: "Midwest",       IN: "Midwest",       IL: "Midwest",       MI: "Midwest",
  WI: "Midwest",       MN: "Midwest",       IA: "Midwest",       MO: "Midwest",
  ND: "Midwest",       SD: "Midwest",       NE: "Midwest",       KS: "Midwest",
  TX: "South Central", OK: "South Central", AR: "South Central", LA: "South Central",
  CO: "Mountain",      UT: "Mountain",      ID: "Mountain",      MT: "Mountain",
  WY: "Mountain",      NV: "Mountain",      AZ: "Mountain",      NM: "Mountain",
  CA: "West",          OR: "West",          WA: "West",          AK: "West",
  HI: "West",
};

export var STATE_NAMES = {
  AL: "Alabama",        AK: "Alaska",         AZ: "Arizona",        AR: "Arkansas",
  CA: "California",     CO: "Colorado",       CT: "Connecticut",    DE: "Delaware",
  DC: "Washington D.C.",FL: "Florida",        GA: "Georgia",        HI: "Hawaii",
  ID: "Idaho",          IL: "Illinois",       IN: "Indiana",        IA: "Iowa",
  KS: "Kansas",         KY: "Kentucky",       LA: "Louisiana",      ME: "Maine",
  MD: "Maryland",       MA: "Massachusetts",  MI: "Michigan",       MN: "Minnesota",
  MS: "Mississippi",    MO: "Missouri",       MT: "Montana",        NE: "Nebraska",
  NV: "Nevada",         NH: "New Hampshire",  NJ: "New Jersey",     NM: "New Mexico",
  NY: "New York",       NC: "North Carolina", ND: "North Dakota",   OH: "Ohio",
  OK: "Oklahoma",       OR: "Oregon",         PA: "Pennsylvania",   RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota",   TN: "Tennessee",      TX: "Texas",
  UT: "Utah",           VT: "Vermont",        VA: "Virginia",       WA: "Washington",
  WV: "West Virginia",  WI: "Wisconsin",      WY: "Wyoming",
};

export function detectRegion(states) {
  if (!states || states.length === 0) return null;
  var upper = states.map(function (s) { return s.toUpperCase().trim(); });
  if (upper.length === 1) return STATE_NAMES[upper[0]] || upper[0];
  if (upper.length >= 25) return "National";
  var regions = upper.map(function (s) { return STATE_REGIONS[s]; }).filter(Boolean);
  var unique = regions.filter(function (r, i) { return regions.indexOf(r) === i; });
  if (unique.length === 0) return null;
  if (unique.length >= 5) return "National";
  if (unique.length === 1) return unique[0];
  return unique.join(", ");
}

export function detectMarketScope(states) {
  if (!states || states.length === 0) return null;
  if (states.length === 1) return "Single State";
  if (states.length >= 25) return "National";
  var upper = states.map(function (s) { return s.toUpperCase().trim(); });
  var regions = upper.map(function (s) { return STATE_REGIONS[s]; }).filter(Boolean);
  var unique = regions.filter(function (r, i) { return regions.indexOf(r) === i; });
  if (unique.length >= 5) return "National";
  return "Regional";
}
