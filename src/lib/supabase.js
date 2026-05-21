import { createClient } from "@supabase/supabase-js";

var SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
var SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env.local");
}

export var supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
