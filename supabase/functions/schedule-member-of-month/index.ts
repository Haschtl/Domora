import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CompletionRow = {
  user_id: string;
  pimpers_earned: number;
  delay_minutes: number | null;
};

type StatsRow = {
  totalPimpers: number;
  totalDelay: number;
  count: number;
};

const buildMonthRange = (now: Date) => {
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);
  return { startOfThisMonth, startOfLastMonth, endOfLastMonth };
};

const pickVariant = (name: string, pimpers: number, monthLabel: string) => {
  const variants = [
    {
      title: "Mitbewohner:in des Monats",
      body: `Glückwunsch, ${name} ist mit ${pimpers} Pimpern im ${monthLabel} eure Putzfee und Mitbewohner:in des Monats.`
    },
    {
      title: "Putzroyalty gekürt",
      body: `${name} holt sich mit ${pimpers} Pimpern den Titel für ${monthLabel}. Krone richten, Applaus!`
    },
    {
      title: "Der Pimper-Pokal geht an…",
      body: `${name} hat im ${monthLabel} ${pimpers} Pimpern gesammelt und ist Mitbewohner:in des Monats.`
    },
    {
      title: "WG-Held:in des Monats",
      body: `Im ${monthLabel} war ${name} nicht zu stoppen: ${pimpers} Pimpern. Mitbewohner:in des Monats!`
    }
  ];
  return variants[Math.floor(Math.random() * variants.length)];
};

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response("Missing env", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const { startOfLastMonth, endOfLastMonth, startOfThisMonth } = buildMonthRange(now);

  const { data: households, error: householdError } = await supabase
    .from("households")
    .select("id");

  if (householdError) {
    return new Response(householdError.message, { status: 500 });
  }

  let scheduled = 0;
  for (const household of households ?? []) {
    const { data: completions, error: completionsError } = await supabase
      .from("task_completions")
      .select("user_id,pimpers_earned,delay_minutes")
      .eq("household_id", household.id)
      .gte("completed_at", startOfLastMonth.toISOString())
      .lte("completed_at", endOfLastMonth.toISOString());

    if (completionsError || !completions || completions.length === 0) {
      continue;
    }

    const stats = new Map<string, StatsRow>();
    (completions as CompletionRow[]).forEach((entry) => {
      const current = stats.get(entry.user_id) ?? { totalPimpers: 0, totalDelay: 0, count: 0 };
      stats.set(entry.user_id, {
        totalPimpers: current.totalPimpers + Math.max(0, Number(entry.pimpers_earned) || 0),
        totalDelay: current.totalDelay + Math.max(0, Number(entry.delay_minutes) || 0),
        count: current.count + 1
      });
    });

    const rows = Array.from(stats.entries()).map(([userId, value]) => ({
      userId,
      totalPimpers: value.totalPimpers,
      averageDelay: value.count > 0 ? value.totalDelay / value.count : 0
    }));

    rows.sort((a, b) => b.totalPimpers - a.totalPimpers || a.averageDelay - b.averageDelay || a.userId.localeCompare(b.userId));
    const winner = rows[0];
    if (!winner) continue;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", winner.userId)
      .maybeSingle();
    const winnerName = String(profile?.display_name ?? "Jemand");
    const monthLabel = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(startOfLastMonth);
    const text = pickVariant(winnerName, winner.totalPimpers, monthLabel);
    const dedupeKey = `member_of_month:${household.id}:${startOfLastMonth.toISOString().slice(0, 7)}`;

    const { error: insertError } = await supabase
      .from("push_jobs")
      .upsert(
        {
          type: "member_of_month",
          household_id: household.id,
          user_id: null,
          payload: {
            title: text.title,
            body: text.body,
            monthLabel,
            winner_user_id: winner.userId,
            total_pimpers: winner.totalPimpers,
            actor_user_id: null
          },
          scheduled_for: startOfThisMonth.toISOString(),
          dedupe_key: dedupeKey
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true }
      );

    if (!insertError) {
      scheduled += 1;
    }
  }

  return new Response(JSON.stringify({ scheduled }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
