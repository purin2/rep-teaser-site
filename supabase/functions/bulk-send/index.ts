import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkSendRequest {
  target: "all" | "unsent" | "selected";
  registration_ids?: string[];
}

interface Registration {
  id: string;
  email: string;
  name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 認証チェック
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { target, registration_ids }: BulkSendRequest = await req.json();

    // 対象者を取得
    let registrations: Registration[] = [];

    if (target === "unsent") {
      // email_logsに成功記録がない登録者
      const { data: sentIds } = await supabase
        .from("email_logs")
        .select("registration_id")
        .eq("status", "sent");

      const excludeIds = sentIds?.map(r => r.registration_id) ?? [];

      let query = supabase.from("registrations").select("id, email, name");
      if (excludeIds.length > 0) {
        query = query.not("id", "in", `(${excludeIds.join(",")})`);
      }
      const { data } = await query;
      registrations = data ?? [];
    } else if (target === "selected" && registration_ids) {
      const { data } = await supabase
        .from("registrations")
        .select("id, email, name")
        .in("id", registration_ids);
      registrations = data ?? [];
    } else {
      // all
      const { data } = await supabase
        .from("registrations")
        .select("id, email, name");
      registrations = data ?? [];
    }

    if (registrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 設定とテンプレートを取得
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["coupon_code", "app_store_url", "google_play_url"]);

    const settingsMap = settings?.reduce((acc, { key, value }) => {
      acc[key] = typeof value === 'string' ? value.replace(/^"|"$/g, "") : "";
      return acc;
    }, {} as Record<string, string>) ?? {};

    const { data: template } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", "default")
      .eq("is_active", true)
      .single();

    if (!template) {
      throw new Error("No active template found");
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";

    let sent = 0;
    let failed = 0;

    // レート制限: 1秒あたり10通
    for (let i = 0; i < registrations.length; i++) {
      const reg = registrations[i];

      const variables: Record<string, string> = {
        name: reg.name || "お客様",
        email: reg.email,
        coupon_code: settingsMap.coupon_code || "",
        app_store_url: settingsMap.app_store_url || "#",
        google_play_url: settingsMap.google_play_url || "#",
      };

      let subject = template.subject;
      let body = template.body;

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      try {
        const { error } = await resend.emails.send({
          from: fromEmail,
          to: reg.email,
          subject,
          html: body,
        });

        await supabase.from("email_logs").insert({
          registration_id: reg.id,
          email: reg.email,
          subject,
          status: error ? "failed" : "sent",
          error_message: error?.message ?? null,
          sent_at: error ? null : new Date().toISOString(),
        });

        if (error) {
          failed++;
        } else {
          sent++;
        }
      } catch (e) {
        failed++;
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        await supabase.from("email_logs").insert({
          registration_id: reg.id,
          email: reg.email,
          subject,
          status: "failed",
          error_message: errorMessage,
        });
      }

      // レート制限: 10通ごとに1秒待機
      if ((i + 1) % 10 === 0 && i < registrations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: registrations.length,
        sent,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
