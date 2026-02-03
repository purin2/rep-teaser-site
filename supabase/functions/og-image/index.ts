import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import satori from "https://esm.sh/satori@0.10.11";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Load font from reliable source
async function loadFont(): Promise<ArrayBuffer> {
  const cssResponse = await fetch(
    "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap",
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0",
      },
    }
  );
  const css = await cssResponse.text();
  const urlMatch = css.match(/url\(([^)]+)\)/);
  if (!urlMatch) {
    throw new Error("Could not find font URL in CSS");
  }
  const fontUrl = urlMatch[1].replace(/['"]/g, '');
  const fontResponse = await fetch(fontUrl);
  if (!fontResponse.ok) {
    throw new Error(`Failed to load font: ${fontResponse.status}`);
  }
  return fontResponse.arrayBuffer();
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

    let remainingCount = 1000;
    try {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "remaining_count")
        .single();

      if (data?.value) {
        remainingCount = parseInt(data.value, 10) || 1000;
      }
    } catch (e) {
      console.warn("Could not fetch remaining count, using default");
    }

    const fontData = await loadFont();

    const svg = await satori(
      {
        type: "div",
        props: {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
            fontFamily: "Noto Sans JP",
            position: "relative",
            overflow: "hidden",
          },
          children: [
            // Star particles
            ...Array.from({ length: 15 }, (_, i) => ({
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  width: `${2 + (i % 3)}px`,
                  height: `${2 + (i % 3)}px`,
                  backgroundColor: `rgba(255, 255, 255, ${0.2 + (i % 5) * 0.1})`,
                  borderRadius: "50%",
                  top: `${(i * 47) % 100}%`,
                  left: `${(i * 31) % 100}%`,
                },
              },
            })),
            // Background glow
            {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "900px",
                  height: "500px",
                  background: "radial-gradient(ellipse at center, rgba(204, 255, 51, 0.12) 0%, transparent 70%)",
                },
              },
            },
            // Rep Logo SVG
            {
              type: "svg",
              props: {
                width: "280",
                height: "100",
                viewBox: "80 40 420 150",
                style: {
                  marginBottom: "24px",
                },
                children: [
                  // Yellow crescent (inner)
                  {
                    type: "path",
                    props: {
                      d: "M173.527 125.333C192.315 125.333 207.547 110.189 207.547 91.5104C207.547 73.3694 193.179 58.5601 175.137 57.7271C178.29 57.0122 181.575 56.6318 184.946 56.6318C209.11 56.6318 228.703 76.1109 228.703 100.135C228.703 124.159 209.11 143.638 184.946 143.638C161.461 143.638 142.297 125.248 141.235 102.155C145.721 115.613 158.486 125.327 173.527 125.327V125.333Z",
                      fill: "#FFF442",
                    },
                  },
                  // Green crescent (outer)
                  {
                    type: "path",
                    props: {
                      d: "M184.966 154.493C154.772 154.493 130.298 130.16 130.298 100.141C130.298 70.1228 153.387 47.1874 182.38 45.8429C177.314 44.6886 172.036 44.0786 166.62 44.0786C127.778 44.0786 96.291 75.3828 96.291 114C96.291 152.617 127.778 183.914 166.614 183.914C205.449 183.914 235.148 154.355 236.863 117.253C229.653 138.883 209.143 154.493 184.959 154.493H184.966Z",
                      fill: "#CCFF33",
                    },
                  },
                  // R
                  {
                    type: "path",
                    props: {
                      d: "M276.135 69.2114H316.95C328.303 69.2114 337.103 72.5301 342.968 78.6296C347.942 83.8043 350.62 91.104 350.62 99.8597V100.122C350.62 115.115 342.842 124.533 331.489 128.914L353.298 162.088H330.341L311.21 132.364H295.78V162.088H276.141V69.2114H276.135ZM315.67 114.321C325.235 114.321 330.717 109.016 330.717 101.185V100.922C330.717 92.1665 324.853 87.6542 315.287 87.6542H295.774V114.321H315.67Z",
                      fill: "#ffffff",
                    },
                  },
                  // e
                  {
                    type: "path",
                    props: {
                      d: "M358.503 129.603V129.373C358.503 111.567 370.701 96.9019 388.156 96.9019C408.184 96.9019 417.36 113.082 417.36 130.77C417.36 132.167 417.248 133.794 417.136 135.427H375.397C377.073 143.455 382.45 147.646 390.056 147.646C395.762 147.646 399.905 145.783 404.602 141.245L414.339 150.204C408.745 157.418 400.69 161.845 389.831 161.845C371.815 161.845 358.503 148.695 358.503 129.603ZM400.802 124.363C399.793 116.446 395.32 111.095 388.156 111.095C380.992 111.095 376.519 116.335 375.173 124.363H400.795H400.802Z",
                      fill: "#ffffff",
                    },
                  },
                  // p
                  {
                    type: "path",
                    props: {
                      d: "M430 98.0624H447.007V107.021C451.15 101.204 456.856 96.895 465.696 96.895C479.681 96.895 493 108.3 493 129.137V129.367C493 150.203 479.905 161.609 465.696 161.609C456.632 161.609 451.037 157.3 447.007 152.295V179.068H430V98.0624ZM475.987 129.367V129.137C475.987 118.781 469.271 111.914 461.328 111.914C453.386 111.914 446.782 118.781 446.782 129.137V129.367C446.782 139.723 453.386 146.589 461.328 146.589C469.271 146.589 475.987 139.841 475.987 129.367Z",
                      fill: "#ffffff",
                    },
                  },
                ],
              },
            },
            // Badge
            {
              type: "div",
              props: {
                style: {
                  padding: "14px 44px",
                  border: "2px solid rgba(204, 255, 51, 0.6)",
                  fontSize: "22px",
                  fontWeight: "700",
                  color: "#CCFF33",
                  letterSpacing: "0.3em",
                  marginBottom: "20px",
                },
                children: "無料招待枠",
              },
            },
            // Counter
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "baseline",
                  gap: "20px",
                },
                children: [
                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "28px",
                        fontWeight: "700",
                        color: "rgba(255, 255, 255, 0.85)",
                        letterSpacing: "0.4em",
                      },
                      children: "あと",
                    },
                  },
                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "130px",
                        fontWeight: "700",
                        color: "#CCFF33",
                        letterSpacing: "-0.02em",
                        lineHeight: "1",
                        textShadow: "0 0 60px rgba(204, 255, 51, 0.5), 0 0 120px rgba(204, 255, 51, 0.3)",
                      },
                      children: remainingCount.toString(),
                    },
                  },
                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "28px",
                        fontWeight: "700",
                        color: "rgba(255, 255, 255, 0.85)",
                        letterSpacing: "0.4em",
                      },
                      children: "名様",
                    },
                  },
                ],
              },
            },
            // Tagline
            {
              type: "div",
              props: {
                style: {
                  marginTop: "36px",
                  fontSize: "20px",
                  fontWeight: "500",
                  color: "rgba(255, 255, 255, 0.6)",
                  letterSpacing: "0.05em",
                },
                children: "経営者限定SNS｜完全招待制・本人確認必須",
              },
            },
          ],
        },
      },
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: "Noto Sans JP",
            data: fontData,
            weight: 700,
            style: "normal",
          },
        ],
      }
    );

    return new Response(svg, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error) {
    console.error("OG Image generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
