const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const config = { runtime: "edge" };

const SCENE_PROMPTS = {
  ins_square: {
    size: "1024x1024",
    direction: "Square 1:1 format for Instagram feed. Clean minimal background, product centered, soft natural lighting. Lifestyle feel, visually appealing for social media.",
  },
  ins_story: {
    size: "1024x1792",
    direction: "Vertical 9:16 format for Instagram Story. Leave space at top and bottom for text overlay. Lifestyle scene, warm natural light, immersive atmosphere.",
  },
  ecommerce_main: {
    size: "1024x1024",
    direction: "E-commerce main product image. Clean white or very light neutral background, product clearly visible, professional studio lighting, no distractions.",
  },
  detail: {
    size: "1024x1024",
    direction: "Product detail close-up shot. Extreme focus on texture, material, and craftsmanship. Macro-style composition, sharp details, soft bokeh background.",
  },
  poster: {
    size: "1024x1365",
    direction: "3:4 promotional poster format. Strong compositional sense, dramatic lighting, premium brand feel. Leave negative space for brand copy and headline text.",
  },
  xiaohongshu: {
    size: "1024x1365",
    direction: "3:4 format for Xiaohongshu (Little Red Book). Warm natural lifestyle scene, cozy and authentic feel, natural daylight, relatable everyday setting.",
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
      return new Response(JSON.stringify({ error: "Product image required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const sceneConfig = SCENE_PROMPTS[scene] || SCENE_PROMPTS.ins_square;

    // Agent 步骤一：分析品牌调性 + 产品特征，生成场景专属 prompt
    const productBase64 = await fileToBase64(productFile);
    const refBase64List = await Promise.all(references.map(fileToBase64));
    const optimizedPrompt = await analyzeAndBuildPrompt(
      apiKey,
      productBase64,
      refBase64List,
      brandKeywords,
      brandColor,
      brandName,
      sceneConfig.direction
    );

    // Agent 步骤二：生成图片，失败自动重试
    const resultImage = await generateWithRetry(
      apiKey,
      productFile,
      optimizedPrompt,
      sceneConfig.size,
      2
    );

    return new Response(JSON.stringify({ image: resultImage, prompt: optimizedPrompt }), {
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

async function analyzeAndBuildPrompt(apiKey, productBase64, refBase64List, keywords, color, brandName, sceneDirection) {
  const refNote = refBase64List.length > 0
    ? `${refBase64List.length} brand reference image(s) are also attached.`
    : "No brand reference images provided.";

  const content = [
    {
      type: "text",
      text: `You are a professional e-commerce visual director. Analyze the product and generate an optimized image editing prompt.

Product image is attached. ${refNote}

Brand profile:
- Keywords: ${keywords || "not specified"}
- Primary color: ${color || "not specified"}
- Brand name: ${brandName || "not specified"}

Scene requirement: ${sceneDirection}

Your task:
1. Identify the product type, color, material, and shape
2. ${refBase64List.length > 0 ? "Extract the visual style, lighting, and color tone from brand reference images" : "Use the brand keywords to determine visual style"}
3. Generate a specific image editing prompt that:
   - Keeps the product EXACTLY as-is (do not change product shape, color, or design)
   - Replaces only the background according to the scene requirement
   - Matches the brand's visual language
   - Is optimized for the specific scene format

Return ONLY the prompt text. Start with "Product photography:"`,
    },
    {
      type: "image_url",
      image_url: { url: `data:image/png;base64,${productBase64}` },
    },
    ...refBase64List.map(b64 => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${b64}` },
    })),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content }],
      max_tokens: 400,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Vision analysis failed");
  return data.choices[0].message.content.trim();
}

async function generateWithRetry(apiKey, productFile, prompt, size, maxRetries) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const adjustedPrompt = attempt === 0
        ? prompt
        : `${prompt} Ultra realistic, maintain exact product appearance, professional quality.`;

      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", adjustedPrompt.slice(0, 1500));
      form.append("size", size);
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

      return `data:image/png;base64,${b64}`;

    } catch (e) {
      lastError = e;
      console.error(`Attempt ${attempt + 1} failed:`, e.message);
    }
  }

  throw lastError;
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
