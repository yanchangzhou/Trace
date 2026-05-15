export const runtime = 'edge';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-c49ca64d549e40adb47404ce59b75619';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(JSON.stringify({ error: `DeepSeek API error (${response.status}): ${text}` }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream the SSE response directly back to the client
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
