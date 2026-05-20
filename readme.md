# discord feed bot

small discord bot that checks reddit and rss feeds every 15 minutes, then posts anything new to the right channel.

## setup

```sh
npm install
cp .env.example .env
npm start
```

put your bot token in `.env`.

add the channel ids for your server:

```env
media_channel_id=
music_channel_id=
games_channel_id=
```

posted item ids are saved in `posted.json`, so restarts do not repost old links.

## public bot

in the discord developer portal, open your app, go to **bot**, and turn on **public bot**.

use the oauth2 url generator with:

- scope: `bot`
- permission: `send messages`, `embed links`, `view channels`

invite it to a server, then put that server's channel ids in `.env`.
