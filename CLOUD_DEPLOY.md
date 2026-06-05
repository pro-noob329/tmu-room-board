# TMU 空き場所ボードを恒久公開する

このフォルダーは Cloudflare Workers + D1 用に準備済みです。

公開後は次の状態になります。

- PCや黒い画面を起動しておく必要なし
- 固定の `workers.dev` URLからアクセス可能
- 投稿・滞在人数・現地メモを全利用者で共有
- 毎日0時に前日の投稿情報を削除
- 0:00-5:00は投稿停止

## 必要なもの

- 無料のCloudflareアカウント
- Node.jsとnpm

Cloudflare Workers無料枠は1日10万リクエスト、D1無料枠は1日500万行読み取り・10万行書き込みです。

## 公開手順

このフォルダーでターミナルを開き、次を順番に実行します。

```powershell
npm install
npx wrangler login
npx wrangler d1 create tmu-room-board
```

最後のコマンドで表示された `database_id` を、`wrangler.jsonc` 内の
`REPLACE_AFTER_DATABASE_CREATION` と置き換えます。

続けてデータベースを初期化し、公開します。

```powershell
npx wrangler d1 execute tmu-room-board --remote --file=./schema.sql
npx wrangler deploy
```

最後に表示される `https://tmu-room-board....workers.dev` が公開URLです。

## 更新するとき

画面の変更後、`index.html`、`styles.css`、`script.js` を `public` フォルダーにもコピーし、
次を実行します。

```powershell
npx wrangler deploy
```
