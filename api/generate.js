const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const config = { maxDuration: 60 };

const SCENE_PROMPTS = {
  ins_square: {
    size: "1024x1024",
    direction: "Instagram feed square post. Bright airy aesthetic, minimal and clean composition, soft natural side lighting.",
  },
  ins_story: {
    size: "1024x1024",
    direction: "Instagram Story lifestyle shot. Authentic real-life home environment, warm afternoon sunlight, lived-in feel. Leave space at top and bottom for text overlay.",
  },
  ecommerce_main: {
    size: "1024x1024",
    direction: "E-commerce hero image. Pure white or very light seamless background, product centered, clean professional studio lighting, no props.",
  },
  detail: {
    size: "1024x1024",
    direction: "Detail close-up shot. Macro-style, shallow depth of field, sharp product surface and texture, completely blurred background.",
  },
  poster: {
    size: "1024x1024",
    direction: "Brand campaign poster. Dramatic lighting, strong negative space for headline text, premium editorial feel.",
  },
  xiaohongshu: {
    size: "1024x1024",
    direction: "Xiaohongshu lifestyle scene. Natural window light, warm and cozy home atmosphere, authentic and relatable everyday setting.",
  },
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  try {
    const incoming = await req.formData();
    const productFile = incoming.get("product");
    const brandKeywords = incoming.get("brand_keywords") || "";
    const brandColor = incoming.get("brand_color") || "";
    const scene = incoming.get("scene") || "ins_square";

    if (!productFile) {
      return new Response(JSON.stringify({ error: "Product image required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const sceneConfig = SCENE_PROMPTS[scene] || SCENE_PROMPTS.ins_square;

    const prompt = `Product photography: keep the product exactly as-is, do not change its shape, color, or design. Replace only the background. Brand style: ${brandKeywords || "clean and professional"}. Primary color tone: ${brandColor || "neutral"}. Scene: ${sceneConfig.direction}. High quality, realistic lighting, professional result.`;

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt.slice(0, 1500));
    form.append("size", "1024x1024");
    form.append("image", productFile, "product.png");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Image generation failed");

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");

    return new Response(JSON.stringify({ image: `data:image/png;base64,${b64}` }), {
      status: 200,
      headers: CORS_HEADERS,
    });

  } catch (e) {
    console.error("Agent error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Agent failed" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
