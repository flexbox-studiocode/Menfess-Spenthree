import sharp from "sharp";

const WIDTH = 1080;
const HEIGHT = 1350;
const MAX_CONTENT = 500;
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function wrap(text, maxChars) {
  const words = [...text.replaceAll("\n", " \n").split(/(\s+)/u)].filter(Boolean);
  const lines = []; let line = "";
  for (const token of words) {
    if (token === "\n") { if (line) lines.push(line); lines.push(""); line = ""; continue; }
    if ([...line, token].join("").length <= maxChars) line += token;
    else {
      if (line.trim()) lines.push(line.trim());
      const chunks = [...token.trimStart()];
      line = chunks.splice(0, maxChars).join("");
      for (let i = 0; i < chunks.length; i += maxChars) lines.push(chunks.slice(i, i + maxChars).join(""));
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export async function renderMenfess({ category, recipient, content }) {
  if (!content || [...content].length > MAX_CONTENT) throw new Error("INVALID_CONTENT");
  const lines = wrap(content.normalize("NFC"), 36);
  const lineHeight = 43;
  const contentHeight = lines.length * lineHeight;
  if (contentHeight > 780) throw new Error("CONTENT_DOES_NOT_FIT");
  const recipientText = recipient ? `Untuk: ${esc(recipient)}` : "";
  const contentText = lines.map((line, index) => `<text x="110" y="${470 + index * lineHeight}" class="body">${esc(line) || "&#160;"}</text>`).join("");
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101936"/><circle cx="920" cy="130" r="300" fill="#4b2f83" opacity=".35"/><rect x="80" y="80" width="920" height="1190" rx="42" fill="#17234a" stroke="#7655c7" stroke-width="3"/><text x="110" y="180" class="brand">MENFESS SPENTHREE</text><text x="110" y="290" class="category">${esc(category).toUpperCase()}</text><text x="110" y="365" class="recipient">${recipientText}</text>${contentText}<text x="110" y="1185" class="footer">Cerita kamu, ruang kita bersama.</text><style>.brand{font:700 42px Arial,sans-serif;fill:#fff}.category{font:700 28px Arial,sans-serif;fill:#c8a8ff;letter-spacing:3px}.recipient{font:400 28px Arial,sans-serif;fill:#d9dff5}.body{font:400 34px Arial,sans-serif;fill:#fff}.footer{font:400 24px Arial,sans-serif;fill:#aeb9d9}</style></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
}

export default async function handler(req, res) {
  if (!process.env.RENDERER_SECRET || req.method !== "POST" || req.headers.authorization !== `Bearer ${process.env.RENDERER_SECRET}`) return res.status(404).end();
  try { const image = await renderMenfess(req.body); res.setHeader("content-type", "image/jpeg"); return res.status(200).send(image); }
  catch { return res.status(422).json({ error: "RENDER_FAILED" }); }
}
