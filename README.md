# ゲームDB

PS5・Nintendo Switch・Nintendo Switch 2向けのゲームソフトを対応機種・開発元/発売元・受賞歴・ジャンルから検索できるファンデータベースです。姉妹サイト[らのべDB](https://izenmi.github.io/ranobe-db/)・[まんがDB](https://izenmi.github.io/manga-db/)のゲーム版として作成しました。全網羅ではなく、話題作・代表作を中心に厳選して収録しています。

https://izenmi.github.io/game-db/

## データについて

`public/data/source/*.json` が一次データです。Wikipedia日本語版などの公開情報を参考に、あらすじ等は独自の文章で要約して作成しています。各ページから参照元のWikipedia記事へリンクしているので、詳細はそちらをご確認ください。データの誤りに気づいた場合はIssueでお知らせください。

`public/data/generated/*.json` はビルド時に `scripts/generate-manifest.mjs` が `source/*.json` から自動生成する非正規化データです(`.gitignore`対象、手で編集しないでください)。

パッケージ画像は現時点では未実装のため、プレースホルダー表示になっています。

## 開発

```sh
npm install
npm run dev       # http://localhost:5173/game-db/
npm run build      # 型チェック + データ整合性チェック + ビルド + prerender
npm run preview
```

`npm run dev` / `npm run build` の前に `scripts/generate-manifest.mjs` が自動実行され、`source/*.json` 内のid参照(会社・ジャンル・アワード)に誤りがあるとビルドが失敗します。

## デプロイ

`main` ブランチへのpushで GitHub Actions (`.github/workflows/deploy.yml`) が自動的にビルドしてGitHub Pagesへ公開します。リポジトリ名を変更する場合は `vite.config.ts` の `base` も合わせて変更してください。
