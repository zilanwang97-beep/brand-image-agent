const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://v0-brand-image-tool.vercel.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const config = { runtime: "edge" };

const SCENE_PROMPTS = {
  ins_square: {
    size: "1024x1024",
    direction: "Square 1:1 format for Instagram feed. Clean minimal background, product centered, soft natural lighting.",
  },
  ins_story: {
    size: "1024x1024",
    direction: "Vertical story format for Instagram. Lifestyle scene, warm natural light, immersive atmosphere, leave space for text.",
  },
  ecommerce_main: {
    size: "1024x1024",
    direction: "E-commerce main product image. Clean white or very light neutral background, professional studio lighting.",
  },
  detail: {
    size: "1024x1024",
    direction: "Product detail close-up shot. Extreme focus on texture, material, and craftsmanship. Sharp details, soft background.",
  },
  poster: {
    size: "1024x1024",
    direction: "Promotional poster format. Strong compositional sense, dramatic lighting, premium brand feel, negative space for text.",
  },
  xiaohongshu: {
    size: "1024x1024",
    direction: "Xiaohongshu lifestyle scene. Warm natural daylight, cozy and authentic feel, relatable everyday setting.",
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
    const brandName = incoming.get("brand_name") || "";
    const scene = incoming.get("scene") || "ins_square";

    const ref1 = incoming.get("reference_1");
    const ref2 = incoming.get("reference_2");
    const ref3 = incoming.get("reference_3");
    const references = [ref1, ref2, ref3].filter(Boolean);

    if (!productFile) {
      return new Response(JSON.strin
