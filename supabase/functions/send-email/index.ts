import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    email: string;
    name?: string;
  };
  schema: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Database Webhookからのペイロードを解析
    const payload: WebhookPayload = await req.json();
    const { id: registration_id, email, name } = payload.record;

    // 自動送信が有効か確認
    const { data: autoSendSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "auto_send_enabled")
      .single();

    if (autoSendSetting?.value !== "true") {
      return new Response(
        JSON.stringify({ success: false, message: "Auto send is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 設定値を取得
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["coupon_code", "app_store_url", "google_play_url"]);

    const settingsMap = settings?.reduce((acc, { key, value }) => {
      acc[key] = typeof value === 'string' ? value.replace(/^"|"$/g, "") : "";
      return acc;
    }, {} as Record<string, string>) ?? {};

    // テンプレートを取得
    const { data: template } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", "default")
      .eq("is_active", true)
      .single();

    if (!template) {
      throw new Error("No active template found");
    }

    // 変数を置換
    const variables: Record<string, string> = {
      name: name || "お客様",
      email,
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

    // Resend でメール送信
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const { error: emailError } = await resend.emails.send({
      from: Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev",
      to: email,
      subject,
      html: body,
    });

    // ログを記録
    const logData = {
      registration_id,
      email,
      subject,
      status: emailError ? "failed" : "sent",
      error_message: emailError?.message ?? null,
      sent_at: emailError ? null : new Date().toISOString(),
    };

    const { data: log } = await supabase
      .from("email_logs")
      .insert(logData)
      .select()
      .single();

    return new Response(
      JSON.stringify({
        success: !emailError,
        log_id: log?.id,
        error: emailError?.message
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
