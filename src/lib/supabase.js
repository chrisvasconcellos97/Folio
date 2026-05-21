import { createClient } from "@supabase/supabase-js";

var SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "https://yrpdjmyfidhxlpmxasao.supabase.co";
var SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlycGRqbXlmaWRoeGxwbXhhc2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Nzg3NDQsImV4cCI6MjA5NDU1NDc0NH0.tutTq1raFxA3HKUWsfYsUJtCZeQfswc3tFh7sqUM2RA";

export var supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
