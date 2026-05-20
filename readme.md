# discord feed bot

small discord bot that checks reddit and rss feeds every 15 minutes, then posts anything new to the right channel.

## setup

```sh
npm install
cp .env.example .env
npm start
```

put your bot token in `.env`.

the bot needs access to these channels:

- media: `1505424780378243182`
- music: `1505424795410501632`
- games: `1505424813127110756`

posted item ids are saved in `posted.json`, so restarts do not repost old links.
