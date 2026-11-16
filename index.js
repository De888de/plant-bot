import { Telegram } from 'puregram';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';

config();

const bot = Telegram.fromToken(process.env.BOT_TOKEN);
const API_KEY = process.env.PLANTNET_KEY;

bot.on('message', async (ctx) => {
  if (ctx.text === '/start' || ctx.text === '🌿 Начать определение') {
    await ctx.send('Отправь фото растения — я попробую определить его.', {
      reply_markup: {
        keyboard: [[{ text: '🌿 Начать определение' }]],
        resize_keyboard: true
      }
    });
    return;
  }

  const fileId = ctx.photo?.biggest?.fileId;
  if (!fileId) return;

  await ctx.send('Определяю...');

  try {
    const file = await bot.api.getFile({ file_id: fileId });
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const imgRes = await fetch(fileUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const form = new FormData();
    form.append('images', buffer, { filename: 'plant.jpg', contentType: 'image/jpeg' });
    form.append('organs', 'auto');

    const res = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${API_KEY}`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const data = await res.json();
    console.log('PlantNet:', JSON.stringify(data).slice(0, 400));

    if (!data.results?.length) {
      await ctx.send('Не удалось определить растение.');
      return;
    }

    const best = data.results[0];
    const name = best.species?.scientificNameWithoutAuthor || 'Неизвестно';
    const common = best.species?.commonNames?.[0] || '—';
    const score = Math.round((best.score || 0) * 100);

    const family = best.species?.family?.scientificNameWithoutAuthor || '';
    const genus = best.species?.genus?.scientificNameWithoutAuthor || '';
    let msg = `🌿 *${name}*\n`;
    if (common && common !== '—') msg += `_${common}_\n\n`;
    if (family) msg += `Семейство: ${family}\n`;
    if (genus) msg += `Род: ${genus}\n`;
    msg += `\nУверенность: ${score}%`;
    if (score < 40) msg += `\n_Низкая уверенность — попробуй фото листьев или цветов крупным планом_`;
    await ctx.send(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error(e);
    await ctx.send('Ошибка: ' + e.message);
  }
});

bot.startPolling().then(() => console.log('Plant Bot запущен'));
