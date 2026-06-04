const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const config = { runtime: "edge" };

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
    const referenceFile = incoming.get("reference");
    const text = incoming.get("text")?.trim() || "";

    if (!productFile) {
      return new Response(JSON.stringify({ error: "Product image required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Agent 步骤一：用 GPT-4o Vision 分析图片，自动生成最优 prompt
    const productBase64 = await fileToBase64(productFile);
    const referenceBase64 = referenceFile ? await fileToBase64(referenceFile) : null;
    const analysisPrompt = await analyzeImages(apiKey, productBase64, referenceBase64, text);

    // Agent 步骤二：生成图片，失败自动重试
    const resultImage = await generateWithRetry(apiKey, productFile, analysisPrompt, 2);

    return new Response(JSON.stringify({ image: resultImage, prompt: analysisPrompt }), {
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

async function analyzeImages(apiKey, productBase64, referenceBase64, userText) {
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `You are a professional product photography director. Analyze the product image and generate an optimal image editing prompt.

Product image is attached. ${referenceBase64 ? "A reference style image is also attached." : ""}
User's style direction: "${userText || "professional brand campaign"}"

Your task:
1. Identify the product's main characteristics (color, material, style, shape)
2. ${referenceBase64 ? "Extract the reference image's background style, lighting, color tone, atmosphere" : "Based on user direction, determine ideal background style"}
3. Generate a concise, specific image editing prompt in English

Return ONLY the prompt text, nothing else. The prompt must start with "Product photography:"`,
        },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${productBase64}` },
        },
        ...(referenceBase64 ? [{
          type: "image_url",
          image_url: { url: `data:image/png;base64,${referenceBase64}` },
        }] : []),
      ],
    },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      max_tokens: 300,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Vision analysis failed");
  return data.choices[0].message.content.trim();
}

async function generateWithRetry(apiKey, productFile, prompt, maxRetries) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const adjustedPrompt = attempt === 0
        ? prompt
        : `${prompt} Ultra realistic, clean composition, professional studio quality.`;

      const form = new FormData();
      form.append("model", "dall-e-2");
      form.append("prompt", adjustedPrompt.slice(0, 1000));
      form.append("size", "1024x1024");
      form.append("response_format", "b64_json");
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
