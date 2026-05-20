import 'dotenv/config'
import { Client, EmbedBuilder, GatewayIntentBits } from 'discord.js'
import Parser from 'rss-parser'
import { promises as fs } from 'node:fs'

const poll_ms = 60 * 60 * 1000
const store_file = new URL('./posted.json', import.meta.url)
const parser = new Parser()

const channels = [
  {
    id: process.env.media_channel_id,
    name: 'media',
    reddits: ['worldnews', 'mildlyinteresting', 'explainlikeimfive', 'funny', 'askreddit'],
    feeds: [
      ['bbc news', 'https://feeds.bbci.co.uk/news/rss.xml'],
      ['ap news', 'https://rsshub.rssforever.com/apnews/topics/apf-topnews'],
      ['motorsport.com', 'https://www.motorsport.com/rss/all/news/']
    ]
  },
  {
    id: '1506599498393059448',
    name: 'tech',
    reddits: ['technology', 'programming', 'MachineLearning'],
    feeds: [
      ['the verge', 'https://www.theverge.com/rss/index.xml'],
      ['ars technica', 'https://feeds.arstechnica.com/arstechnica/index'],
      ['hacker news', 'https://hnrss.org/frontpage']
    ]
  },
  {
    id: process.env.games_channel_id,
    name: 'games',
    reddits: ['gaming', 'piracy'],
    feeds: [
      ['ign', 'https://www.ign.com/rss/v2/articles/feed'],
      ['kotaku', 'https://kotaku.com/rss']
    ]
  },
  {
    id: process.env.music_channel_id,
    name: 'music',
    reddits: ['music', 'ifyoulikeblank'],
    feeds: [
      ['pitchfork', 'https://pitchfork.com/rss/news/'],
      ['billboard', 'https://www.billboard.com/feed/']
    ]
  }
]

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

let posted = new Set()
let polling = false

async function load_posted() {
  try {
    const raw = await fs.readFile(store_file, 'utf8')
    posted = new Set(JSON.parse(raw))
  } catch {
    posted = new Set()
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

function reddit_image(data) {
  const preview = data.preview?.images?.[0]?.source?.url
  if (preview) return preview.replaceAll('&amp;', '&')

  if (data.post_hint === 'image' && data.url?.startsWith('http')) return data.url
  if (data.thumbnail?.startsWith('http')) return data.thumbnail
}

async function reddit(sub) {
  const paths = [
    `https://www.reddit.com/r/${sub}/new/.json?limit=5&raw_json=1`,
    `https://old.reddit.com/r/${sub}/new/.json?limit=5&raw_json=1`
  ]

  let res
  for (const url of paths) {
    res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'accept': 'application/json,text/plain,*/*',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; discord-feed-bot/1.0; +https://github.com/jxherc/discord-feed-bot)'
      }
    })

    if (res.ok) break
  }

  if (!res.ok) throw new Error(`reddit ${sub}: ${res.status}`)

  const json = await res.json()
  return json.data.children.map(({ data }) => ({
    id: `reddit:${data.name}`,
    title: data.title,
    source: `r/${sub}`,
    url: `https://www.reddit.com${data.permalink}`,
    image: reddit_image(data)
  }))
}

function rss_image(item) {
  if (item.enclosure?.type?.startsWith('image/') && item.enclosure.url) return item.enclosure.url

  const media = item['media:content']
  if (Array.isArray(media)) return media.find(x => x?.$?.url)?.$.url
  if (media?.$?.url) return media.$.url

  const html = item['content:encoded'] || item.content || ''
  return html.match(/<img[^>]+src=["']([^"']+)/i)?.[1]
}

async function rss(name, url) {
  const feed = await parser.parseURL(url)

  return feed.items.slice(0, 5).map(item => ({
    id: `rss:${item.guid || item.link}`,
    title: item.title || name,
    source: name,
    url: item.link,
    image: rss_image(item)
  })).filter(item => item.url)
}

async function send(channel, item) {
  if (posted.has(item.id)) return

  await channel.send({ embeds: [embed(item)] })
  posted.add(item.id)
}

async function poll() {
  if (polling) return
  polling = true

  try {
    for (const cfg of channels) {
      const channel = await client.channels.fetch(cfg.id)
      if (!channel) continue

      for (const sub of cfg.reddits) {
        try {
          const items = await reddit(sub)
          for (const item of items.reverse()) await send(channel, item)
        } catch (err) {
          console.error(err.message)
        }
      }

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
  setInterval(poll, poll_ms)
})

client.login(process.env.discord_token)
