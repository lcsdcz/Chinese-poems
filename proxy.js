// /api/proxy.js  — Vercel Serverless Function
export default async function handler(req, res) {
  // 允许的来源：生产、预览、本地（按需改成你的域名）
  const origin = req.headers.origin || '';
  const ALLOW_ORIGINS = [
    'https://chinese-poems2.vercel.app',
    'https://chinese-poems2-git-main-chen-zhengs-projects.vercel.app',
    'https://chinese-poems2-cxo6z1s8e-chen-zhengs-projects.vercel.app',
    'http://localhost:3000'
  ];
  const allowOrigin = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];

  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin'); // 让 CDN/缓存按源区分
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  // 关键：把浏览器预检报的请求头全放回去（最稳妥）
  const acrh = req.headers['access-control-request-headers'];
  res.setHeader('Access-Control-Allow-Headers', acrh || 'Content-Type, Authorization');
  // 如果你前端要带 cookie，这里要开启；同时上面的 Allow-Origin 不能是 *
  // res.setHeader('Access-Control-Allow-Credentials', 'true');

  // 处理预检
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 解析 JSON body（Vercel 有时是字符串）
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { message } = body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 注意：这是**给上游 OpenAI** 的，不参与浏览器 CORS 预检
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的语文学习助手，专门帮助学生理解古诗文、文学知识和文化背景。请用中文回答，保持友好和专业。'
          },
          { role: 'user', content: message }
        ]
      })
    });

    const text = await upstream.text(); // 先取文本，便于错误透传
    if (!upstream.ok) {
      return res.status(upstream.status).send(text);
    }

    // 可选：简化返回结构，前端更易用
    try {
      const json = JSON.parse(text);
      return res.status(200).json({
        reply: json?.choices?.[0]?.message?.content ?? '',
        usage: json?.usage ?? null,
        raw: json // 如果不想暴露完整响应，可以去掉
      });
    } catch {
      // 极少数情况下 OpenAI 会返回非 JSON（几乎不会）
      return res.status(200).send(text);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Upstream error', message: e?.message || String(e) });
  }
}
