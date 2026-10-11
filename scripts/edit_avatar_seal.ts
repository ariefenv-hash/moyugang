import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const SRC = '/home/z/my-project/src/assets/images/hero_poet_avatar_1791652089636.jpg';
const OUT = process.argv[2] || '/tmp/avatar_fixed_v1.png';
const PROMPT = process.argv[3] || `在左侧竖排题字栏中，删除「印章」两个字的竖排文字，并删除其下方那方形红色、印文刻着「印章」二字的印章。删除后该处只保留空白宣纸纹理，与周围纸面底色自然融合。完整保留：上方的竖排大字书法题诗、中间的竖排小字落款、画面最左下角的那方形小红印、挥剑人物、竹子、远山、光效等所有其他元素，其余一切保持原样不变。`;

async function main() {
  const zai = await ZAI.create();
  const b64 = fs.readFileSync(SRC).toString('base64');
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  const response = await zai.images.generations.edit({
    prompt: PROMPT,
    images: [{ url: dataUrl }],
    size: '1024x1024',
  });

  const outB64 = response?.data?.[0]?.base64;
  if (!outB64) throw new Error('No image data in response');
  fs.writeFileSync(OUT, Buffer.from(outB64, 'base64'));
  console.log('saved:', OUT);
}

main().catch((e) => { console.error('EDIT FAILED:', e.message); process.exit(1); });
