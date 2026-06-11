require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { QuickDB } = require('quick.db');
const {
  Client,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

const PORT = process.env.PORT || 3000;
const PREFIX = '!';
const FRONTEND_DIR = path.join(__dirname, 'game-hub-source');
const db = new QuickDB();

const shopItems = [
  { id: 1, name: 'Cargo VIP', price: 500 },
  { id: 2, name: 'Cor de Nome', price: 200 },
  { id: 3, name: 'Badge de Campeao', price: 1000 },
];

function balanceKey(discordId) {
  return `balance_${discordId}`;
}

async function getBalance(discordId) {
  return (await db.get(balanceKey(discordId))) || 0;
}

async function setBalance(discordId, balance) {
  await db.set(balanceKey(discordId), balance);
}

async function addCoins(discordId, amount) {
  const currentBalance = await getBalance(discordId);
  const newBalance = currentBalance + amount;
  await setBalance(discordId, newBalance);
  return newBalance;
}

async function removeCoins(discordId, amount) {
  const currentBalance = await getBalance(discordId);

  if (currentBalance < amount) {
    return { success: false, balance: currentBalance };
  }

  const newBalance = currentBalance - amount;
  await setBalance(discordId, newBalance);
  return { success: true, balance: newBalance };
}

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/economy/add-coins', async (req, res) => {
  try {
    const { discordId, amount } = req.body;

    if (!discordId || typeof discordId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'discordId e obrigatorio e deve ser uma string.',
      });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount e obrigatorio e deve ser um numero inteiro positivo.',
      });
    }

    const newBalance = await addCoins(discordId, amount);

    return res.json({
      success: true,
      newBalance,
    });
  } catch (error) {
    console.error('Erro ao adicionar moedas:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao adicionar moedas.',
    });
  }
});

app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Express rodando com sucesso na porta ${PORT}`);
  console.log(`Game Hub disponivel em http://localhost:${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Bot online como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) {
    return;
  }

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  try {
    if (command === 'saldo' || command === 'bal') {
      const balance = await getBalance(message.author.id);
      await message.reply(`Seu saldo atual e de ${balance} Progresso Coins.`);
      return;
    }

    if (command === 'loja') {
      const itemList = shopItems
        .map((item) => `${item.id}. ${item.name} - ${item.price} moedas`)
        .join('\n');

      await message.reply(`Loja de itens:\n${itemList}\n\nUse \`!comprar <numero_do_item>\` para comprar.`);
      return;
    }

    if (command === 'comprar') {
      const itemId = Number(args[0]);
      const item = shopItems.find((shopItem) => shopItem.id === itemId);

      if (!item) {
        await message.reply('Item nao encontrado. Use `!loja` para ver os itens disponiveis.');
        return;
      }

      const purchase = await removeCoins(message.author.id, item.price);

      if (!purchase.success) {
        await message.reply(
          `Voce nao tem moedas suficientes para comprar ${item.name}. Seu saldo atual e ${purchase.balance} Progresso Coins.`
        );
        return;
      }

      await message.reply(
        `Compra confirmada: ${item.name}! Seu novo saldo e ${purchase.balance} Progresso Coins.`
      );
      return;
    }

    if (command === 'rank') {
      const rows = await db.all();
      const ranking = rows
        .filter((row) => row.id.startsWith('balance_'))
        .map((row) => ({
          discordId: row.id.replace('balance_', ''),
          balance: Number(row.value) || 0,
        }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 3);

      if (ranking.length === 0) {
        await message.reply('Ainda nao ha usuarios no ranking.');
        return;
      }

      const rankingText = ranking
        .map((entry, index) => `${index + 1}. <@${entry.discordId}> - ${entry.balance} Progresso Coins`)
        .join('\n');

      await message.reply(`Top 3 usuarios com mais moedas:\n${rankingText}`);
    }
  } catch (error) {
    console.error('Erro ao executar comando:', error);
    await message.reply('Ocorreu um erro ao executar esse comando.');
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN nao foi definido nas variaveis de ambiente.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
