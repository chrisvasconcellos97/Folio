// RLS boundary probe — verify user A cannot read user B's rows by hitting
// Supabase REST directly with user A's anon-key + JWT.
//
// Skips if SUPABASE_URL / SUPABASE_ANON_KEY / userB creds aren't configured.

export async function run({ page, config }) {
  const results = [];

  if (!config.supabase.url || !config.supabase.anonKey) {
    results.push({
      name: "RLS scenario configured",
      passed: false,
      note: "SUPABASE_URL or SUPABASE_ANON_KEY not set in .env — scenario skipped",
      skipped: true,
    });
    return results;
  }

  const { url, anonKey } = config.supabase;

  // Sign in user A directly against gotrue.
  const tokenA = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email: config.user.email, password: config.user.password }),
  }).then((r) => r.json()).catch(() => null);

  if (!tokenA?.access_token) {
    results.push({
      name: "user A can authenticate to Supabase directly",
      passed: false,
      note: "could not get token — check creds + anon key",
    });
    return results;
  }

  // Try to read folio_accounts — should return ONLY user A's rows.
  const accountsA = await fetch(`${url}/rest/v1/folio_accounts?select=id,user_id&limit=50`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${tokenA.access_token}` },
  }).then((r) => r.json()).catch(() => null);

  const onlyOwnRows = Array.isArray(accountsA) &&
    accountsA.every((row) => !row.user_id || row.user_id === tokenA.user?.id);

  results.push({
    name: "folio_accounts read only returns own rows",
    passed: onlyOwnRows,
    note: `returned ${Array.isArray(accountsA) ? accountsA.length : "non-array"} rows`,
  });

  // If user B is configured, sign in as B and try to read A's rows by ID.
  if (config.userB.email && config.userB.password && Array.isArray(accountsA) && accountsA.length > 0) {
    const tokenB = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ email: config.userB.email, password: config.userB.password }),
    }).then((r) => r.json()).catch(() => null);

    if (tokenB?.access_token) {
      const aId = accountsA[0].id;
      const stolen = await fetch(
        `${url}/rest/v1/folio_accounts?id=eq.${encodeURIComponent(aId)}&select=*`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${tokenB.access_token}` } }
      ).then((r) => r.json()).catch(() => null);

      const blocked = Array.isArray(stolen) && stolen.length === 0;
      results.push({
        name: "user B cannot read user A's account row by id",
        passed: blocked,
        note: blocked
          ? "RLS blocked the read"
          : `RLS FAILED — user B got ${Array.isArray(stolen) ? stolen.length : "non-array"} rows back`,
      });
    }
  }

  return results;
}
