import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export function useAccountMetrics(userId) {
  var [revenueHistory, setRevenueHistory] = useState([]);
  var [shopMetrics, setShopMetrics]       = useState([]);
  var [loading, setLoading]               = useState(false);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      supabase.from("folio_revenue_history").select("*").eq("user_id", userId).order("year").order("month"),
      supabase.from("folio_shop_metrics").select("*").eq("user_id", userId).order("year").order("month"),
    ]).then(function (results) {
      setLoading(false);
      if (!results[0].error) setRevenueHistory(results[0].data || []);
      if (!results[1].error) setShopMetrics(results[1].data || []);
    });
  }, [userId]);

  useEffect(function () { fetch(); }, [fetch]);

  function upsertRevenue(accountId, month, year, revenue) {
    return supabase
      .from("folio_revenue_history")
      .upsert(
        { user_id: userId, account_id: accountId, month: month, year: year, revenue: revenue },
        { onConflict: "user_id,account_id,month,year" }
      )
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function upsertShopMetrics(accountId, month, year, connected, integrated, no_connection) {
    return supabase
      .from("folio_shop_metrics")
      .upsert(
        { user_id: userId, account_id: accountId, month: month, year: year, connected: connected, integrated: integrated, no_connection: no_connection },
        { onConflict: "user_id,account_id,month,year" }
      )
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  return { revenueHistory, shopMetrics, loading, upsertRevenue, upsertShopMetrics, refetch: fetch };
}
