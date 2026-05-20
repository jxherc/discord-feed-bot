import 'dotenv/config'
import { Client, EmbedBuilder, GatewayIntentBits } from 'discord.js'
import Parser from 'rss-parser'
import { promises as fs } from 'node:fs'

const poll_ms = 60 * 60 * 1000
const store_file = new URL('./posted.json', import.meta.url)
const parser = new Parser({ customFields: { item: [['media:thumbnail', 'media:thumbnail']] } })

const channels = [
  {
    id: process.env.media_channel_id,
    name: 'media',
    feeds: [
      ['bbc news', 'https://feeds.bbci.co.uk/news/rss.xml'],
      ['ap news', 'https://rsshub.rssforever.com/apnews/topics/apf-topnews'],
      ['reuters', 'https://feeds.reuters.com/reuters/topNews'],
      ['the guardian', 'https://www.theguardian.com/world/rss'],
      ['npr', 'https://feeds.npr.org/1001/rss.xml'],
      ['motorsport.com', 'https://www.motorsport.com/rss/all/news/']
    ]
  },
  {
    id: '1506599498393059448',
    name: 'tech',
    feeds: [
      ['the verge', 'https://www.theverge.com/rss/index.xml'],
      ['ars technica', 'https://feeds.arstechnica.com/arstechnica/index'],
      ['wired', 'https://www.wired.com/feed/rss'],
      ['techcrunch', 'https://techcrunch.com/feed/'],
      ['hacker news', 'https://hnrss.org/frontpage']
    ]
  },
  {
    id: process.env.games_channel_id,
    name: 'games',
    feeds: [
      ['ign', 'https://www.ign.com/rss/v2/articles/feed'],
      ['kotaku', 'https://kotaku.com/rss'],
      ['polygon', 'https://www.polygon.com/rss/index.xml'],
      ['rock paper shotgun', 'https://www.rockpapershotgun.com/feed'],
      ['eurogamer', 'https://www.eurogamer.net/feed']
    ]
  },
  {
    id: process.env.music_channel_id,
    name: 'music',
    feeds: [
      ['pitchfork', 'https://pitchfork.com/rss/news/'],
      ['billboard', 'https://www.billboard.com/feed/'],
      ['nme', 'https://www.nme.com/feed'],
      ['stereogum', 'https://www.stereogum.com/feed/'],
      ['consequence of sound', 'https://consequenceofsound.net/feed']
    ]
  }
]

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

let posted = new Set()
let polling = false

let is_first_run = false

async function load_posted() {
  try {
    const raw = await fs.readFile(store_file, 'utf8')
    posted = new Set(JSON.parse(raw))
  } catch {
    posted = new Set()
    is_first_run = true
  }
}

async function save_posted() {
  const ids = [...posted].slice(-5000)
  await fs.writeFile(store_file, JSON.stringify(ids, null, 2))
}

function embed(item) {
  const msg = new EmbedBuilder()
    .setTitle(item.title.slice(0, 256))
    .setURL(item.url)
    .setDescription(item.source)
    .setColor(0x2f3136)

  if (item.image) msg.setImage(item.image)
  return msg
}


function rss_image(item) {
  if (item.enclosure?.type?.startsWith('image/') && item.enclosure.url) return item.enclosure.url

  const media = item['media:content']
  if (Array.isArray(media)) return media.find(x => x?.$?.url)?.$.url
  if (media?.$?.url) return media.$.url

  const thumb = item['media:thumbnail']
  if (Array.isArray(thumb)) return thumb.find(x => x?.$?.url)?.$.url
  if (thumb?.$?.url) return thumb.$.url
  if (typeof thumb === 'string' && thumb.startsWith('http')) return thumb

  const html = item['content:encoded'] || item.content || ''
  return html.match(/<img[^>]+src=["']([^"']+)/i)?.[1]
}

async function rss(name, url) {
  const feed = await parser.parseURL(url)
  const feed_image = feed.image?.url

  return feed.items.slice(0, 3).map(item => ({
    id: `rss:${item.guid || item.link}`,
    title: item.title || name,
    source: name,
    url: item.link,
    image: rss_image(item) || feed_image
  })).filter(item => item.url)
}

async function send(channel, item) {
  if (posted.has(item.id)) return

  if (!is_first_run) await channel.send({ embeds: [embed(item)] })
  posted.add(item.id)
}

async function poll() {
  if (polling) return
  polling = true

  try {
    for (const cfg of channels) {
      const channel = await client.channels.fetch(cfg.id)
      if (!channel) continue

      for (const feed of cfg.feeds) {
        try {
          const items = await rss(...feed)
          for (const item of items.reverse()) await send(channel, item)
        } catch (err) {
          console.error(err.message)
        }
      }
    }

    await save_posted()
  } finally {
    polling = false
  }
}

client.once('clientReady', async () => {
  console.log(`logged in as ${client.user.tag}`)
  await load_posted()
  await poll()
  if (is_first_run) {
    console.log('first run: seeded posted list, no messages sent')
    is_first_run = false
  }
  setInterval(poll, poll_ms)
})

client.login(process.env.discord_token)
