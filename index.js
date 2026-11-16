import { Telegram } from 'puregram';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

config();

const bot = Telegram.fromToken(process.env.BOT_TOKEN);
const API_KEY = process.env.PLANTNET_KEY;
const DB_FILE = './data.json';

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users: {}, history: [] }; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

let db = loadDB();

bot.on('message', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId && !db.users[userId]) {
    db.users[userId] = { first: Date.now(), count: 0 };
    saveDB(db);
  }

  if (ctx.text === '/start' || ctx.text === '🌿 Начать определение') {
    const totalUsers = Object.keys(db.users).length;
    await ctx.send(`Отправь фото растения — я попробую определить его.\n\n👥 Пользователей: ${totalUsers}`, {
      reply_markup: {
        keyboard: [[{ text: '🌿 Начать определение' }, { text: '📜 История' }]],
        resize_keyboard: true
      }
    });
    return;
  }

  if (ctx.text === '📜 История' || ctx.text === '/history') {
    const my = db.history.filter(h => h.userId === userId).slice(-10).reverse();
    if (!my.length) {
      await ctx.send('История пуста. Отправь фото растения.');
      return;
    }
    const lines = my.map((h, i) => `${i+1}. ${h.name} (${h.score}%) — ${new Date(h.date).toLocaleString('ru')}`);
    await ctx.send('📜 Последние определения:\n\n' + lines.join('\n'));
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
    if (!data.results?.length) {
      await ctx.send('Не удалось определить растение.');
      return;
    }

    const best = data.results[0];
    const name = best.species?.scientificNameWithoutAuthor || 'Неизвестно';
    const common = best.species?.commonNames?.[0] || '';
    const score = Math.round((best.score || 0) * 100);

    db.history.push({ userId, name, score, date: Date.now() });
    if (db.users[userId]) db.users[userId].count++;
    if (db.history.length > 500) db.history = db.history.slice(-500);
    saveDB(db);

    let msg = `🌿 *${name}*\n`;
    if (common) msg += `_${common}_\n\n`;
    msg += `Уверенность: ${score}%`;
    if (score < 40) msg += `\n_Низкая уверенность — попробуй фото листьев крупным планом_`;
    await ctx.send(msg, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error(e);
    await ctx.send('Ошибка: ' + e.message);
  }
});

bot.startPolling().then(() => console.log('Plant Bot запущен'));
