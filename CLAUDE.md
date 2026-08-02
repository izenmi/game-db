# game-db

PS5・Nintendo Switch・Nintendo Switch 2向けのゲームソフトを対応機種・開発元/発売元・受賞歴・ジャンルから検索できるファンデータベース。姉妹サイト[らのべDB](https://izenmi.github.io/ranobe-db/)(`izenmi/ranobe-db`)・[まんがDB](https://izenmi.github.io/manga-db/)(`izenmi/manga-db`)のゲーム版として作成した。アーキテクチャ・デザインシステム・運用ノウハウの多くをranobe-dbから移植している(コピー元の選定理由は後述)。全網羅ではなく**話題作・代表作中心の厳選リスト**として運用する方針(2026-08-02にユーザーと合意)。

- 公開URL: https://izenmi.github.io/game-db/ (未公開。GitHubリポジトリ作成・初回pushは別途実施)
- リポジトリ: `izenmi/game-db`(public予定。GitHub Pagesは無料枠だとpublicでないと使えない)
- スタック: React 18 + TypeScript + Vite 5 + `react-router-dom`(`BrowserRouter`)。ranobe-dbと異なり最初からBrowserRouterで作っているため、旧HashRouter互換のリダイレクト処理は存在しない(manga-dbと同じ)

## データフロー(source → generated)

- `public/data/source/*.json` … 手作業で作成・**コミットする**一次データ(games/companies/genres/awards)
- `public/data/generated/*.json` … `scripts/generate-manifest.mjs` がビルド時に生成する非正規化データ。**`.gitignore`対象**、`predev`/`prebuild`npmスクリプトで毎回再生成するので手で編集しない
- 生成スクリプトは全Gameの`developerIds`/`publisherId`/`genreIds`/`awardResults[].awardId`が対応するsourceに存在するかを検証し、存在しなければビルドを失敗させる。**`developerIds`が空配列の場合もエラーになる**(開発元は必須)。`platforms`も空配列や`ps5`/`switch`/`switch2`以外の値があるとエラーになる
- 会社・ジャンル・アワードの詳細ページは、それぞれのゲーム一覧を`GameGenerated`型でフル展開して埋め込む(`GameCard`をそのまま再利用できるようにするため)

## 会社(companies)の設計 — ranobe-db/manga-dbとの最大の違い

ライトノベル/コミックの「著者・イラストレーター・出版社」のような**役割ごとに別JSONファイルを分ける設計は採用していない**。ゲームの開発元・発売元はどちらも「会社」という同一種類のエンティティで、かつ同一企業が両方を兼ねるケース(任天堂・カプコン・スクウェア・エニックス・フロム・ソフトウェア等の自社開発+自社発売タイトル)が非常に多いため、**単一の`companies.json`を`developerIds: string[]`(共同開発対応、最低1件必須)と`publisherId: string`(単数)の両方から参照する**構成にした。

この設計ゆえに`src/types.ts`の`CompanyGenerated`は`games: CompanyGameEntry[]`(`{ game, roles: ("developer"|"publisher")[] }`)という形を持ち、`CompanyDetailPage.tsx`は`roles.includes("developer")`/`roles.includes("publisher")`で「開発作品」「発売作品」の2セクションに分けて表示する。ranobe-dbの`PersonListPage`/`PersonDetailPage`のような`kind="author"|"illustrator"|"publisher"`分岐は不要(companies.jsonが単一ファイルのため)で、`CompanyListPage`/`CompanyDetailPage`は分岐なしの単一実装。

**この設計判断ゆえに、scaffold時のコピー元はmanga-dbではなくranobe-dbを使った**(著者+イラストレーターの「2ロール」構造の方が、開発元+発売元の「2ロール」構造への改造がシンプルだったため。manga-dbは原作者/作画家/出版社/レーベルの4分割で、game-dbには不要な「レーベル」概念の除去が余計にかかる)。

## 対応機種(platforms)の方針

`GamePlatform = "ps5" | "switch" | "switch2"`。テーマ/ジャンルのような別JSON参照エンティティではなく、`GameSource.platforms: GamePlatform[]`としてGame本体に直接埋め込む(1本のゲームが複数機種で出ることが普通にあるため配列)。一覧ページ・ジャンル詳細ページに対応機種でのセレクトフィルターを実装している。

**「対応機種」に含めるかどうかの判断基準**(2026-08-02、初回18本のデータ投入時に確立):
- **専用パッケージ版・専用エディションが実際に発売されている機種のみ**を対応機種とする。動作最適化パッチ(既存ソフトがSwitch2上で高解像度・高フレームレートで動くだけ)は対応機種に含めない(例: スプラトゥーン3、ポケットモンスター スカーレット・バイオレット)
- **クラウド版のみ**(ネイティブ移植なし)も対応機種に含めない(例: バイオハザード ヴィレッジのSwitch版はクラウド版のみのため`switch`は含めていない)
- **発表済みだが本サイト運用時点でまだ発売されていないタイトル**は対応機種に含めない。`sourceNote`に発売予定日を明記する(例: ELDEN RINGのSwitch2版「Tarnished Edition」は2026-08-28発売予定だが、2026-08-02時点で未発売のため`platforms`に`switch2`を含めていない)
- リマスター版・完全版が別発売日で出ている場合、`releaseDate`は収録している対応機種の中で最速の発売日を採用し、機種別の発売日の違いは`sourceNote`に明記する

## データ入力ルール(ranobe-db/manga-dbから踏襲)

- **出典は日本語版Wikipediaを基本とするが必須ではない**。Wikipediaに記事がない、または情報が薄いタイトルは公式サイト・信頼できる報道(Famitsu、4Gamer、GAME Watch等)で補ってよい。書き込む前に必ず何らかの情報源で裏取りし、`sourceNote`に何を確認したか・どの情報源を使ったか・何が未確認かを明記する
- **あらすじはコピペ禁止**。Wikipediaの文章表現をそのまま転記せず、150〜250字程度で必ず自分の言葉で要約する
- **実在確認できない候補は無理に埋めない**方針(ranobe-db/manga-dbと同じ)。目標本数に届かなくても、確認できたタイトルのみ収録する
- 新規idを追加する前に既存の`companies.json`/`genres.json`/`awards.json`を確認し、同一企業・同一賞の重複登録を避ける(任天堂・カプコン等は開発元・発売元の両方として何度も登場する)

## 収録範囲の方針(2026-08-02にユーザーと合意)

全網羅のカタログ化は目指さない。PS5/Switch/Switch2それぞれで**話題作・代表作**を中心に厳選収録する。scaffold時点で18本(ジャンル・機種のバランスを意識して選定)。今後の拡充もranobe-db/manga-dbと同じ小バッチ(10〜15本程度)ワークフローを踏襲する想定だが、`scripts/apply_batch.py`は本サイト用に新規作成済み(`newCompanies`/`newGenres`/`newAwards`/`games`キー、`developerIds`空配列・`platforms`空配列/不正値のチェック付き)。

## 受賞歴(awards)の方針

ゲーム関連の主要アワードを`awardResults`に含める。scaffold時点で登録済み:

日本ゲーム大賞、The Game Awards、BAFTA Games Awards、D.I.C.E. Awards、Golden Joystick Awards、Game Developers Choice Awards(GDC Awards)、PlayStation Awards(PlayStation Partner Awards等の後継含む。**対象がPlayStation系タイトルに偏る点に留意**)、ファミ通アワード、SXSW Gaming Awards

- 作品自体の受賞・順位が明記されているものだけを採用する
- 同一アワードでも部門(Best Narrative、Action Game of the Year等)ごとに`result`欄で書き分ける。同じ`awardId`・同じ`year`で複数エントリを持つことがある(例: ポケットモンスター スカーレット・バイオレットは日本ゲーム大賞2023で「ベストセールス賞」と「年間作品部門優秀賞」の両方を受賞)
- 拡張版(例: モンスターハンターライズ:サンブレイク)の受賞歴は、ベース作品のgameエントリに含めた上で`result`に「(拡張版「〇〇」として)」等と明記する(拡張版を別gameとして登録していないため)

## ジャンルタグの方針

再利用可能な少数タグに絞る(ranobe-db/manga-dbのテーマタグと同じ考え方)。scaffold時点のタグ: アクションRPG/オープンワールド/アクションアドベンチャー/RPG/レーシング/シミュレーション/対戦アクション/シューター/サバイバルホラー/ライフシミュレーション/戦術RPG/ソウルライク。新規タイトル追加時、既存タグで表現しきれない要素があれば`genres.json`にタグを追加してよい。

## デザイン方針

- パステルカラー基調、グラデーションはなるべく使わない。ranobe-db(水色)・manga-db(パステルオレンジ)と被らない**パステルグリーン**(`--color-green`/`-strong`/`-deep`、`theme.css`)がメインアクセント(ナビタイトル・アクティブナビ・ホーム見出し・カード/チップ/ページャーのホバー枠線)。カバー画像プレースホルダー・カウントバッジ・受賞年ピルの6色ローテーション(紫/ピンク/水色/ミント/黄/ピーチ)は装飾用の別パレットなので維持している
- **対応機種バッジ**(`.platform-badge`、PS5/Switch/Switch2)はsite accentとも装飾ローテーションとも別の小さな専用パレット(`--color-platform-ps5`/`-switch`/`-switch2`)を使う。`GameCard`のメタ行・`GameDetailPage`のヒーロー領域に表示
- ページ背景は黒一色固定、装飾(影・グラデーション・点線ボーダー等)は基本つけない
- 見出しフォントは`M PLUS Rounded 1c`。favicon(`public/favicon.svg`、`#6bc34a`)は黒背景+「ゲ」の1文字ロゴ(ranobe-dbの「ら」・manga-dbの「ま」と同じ命名則)
- `src/theme/theme.css`・`src/ui/common/common.css`はranobe-dbからほぼ無変更でコピーしている(アクセントカラーと対応機種バッジ以外)
- ゲームカード(`GameCard.tsx`)はカード全体をクリックすると詳細ページへ遷移する(ranobe-db/manga-dbの`WorkCard`と同じパターン)。内部のジャンルチップだけは`stopPropagation`でジャンルページへの遷移を維持

## 購入リンク・パッケージ画像

- **購入リンクはAmazon検索URLのみ**実装(`amazonSearchUrl(title, platform?)`、`src/ui/common/GameCover.tsx`)。アフィリエイトタグ`izenmi-22`(ranobe-db/manga-dbと共通)付きの検索URLを生成し、対応機種ごとに「PS5版をAmazonで探す」等のリンクをゲーム詳細ページに表示する。PlayStation Store・Nintendo公式サイト内のソフト検索へのリンクは、manga-dbの`WebComicPlatform`ルール(実装前に必ずブラウザで実際に検索してURLパターンを目視確認する、憶測でURLを書かない)を踏襲し、**今回は未実装**(2026-08-02時点で未検証)
- **パッケージ画像は`scripts/fetch-covers.mjs`(2026-08-02実装)で取得済み**。ranobe-db/manga-dbの楽天ブックスAPI(書籍・ISBNベース、ゲームソフトには使えない)とは別に、**楽天市場の商品検索API(`IchibaItem/Search`、ジャンルID`101205`=テレビゲーム)**を使う。`npm run fetch-covers`(要`RAKUTEN_APP_ID`/`RAKUTEN_ACCESS_KEY`環境変数)でタイトル名から代表商品を検索し、`public/data/source/covers-cache.json`に保存する(コミット対象、ビルド時には叩かない)。
  - **エンドポイントは新gateway**: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`(ranobe-db/manga-dbが使う`app.rakuten.co.jp/services/api/BooksTotal/Search/...`とは別ドメイン・別世代のAPI)。認証情報の形式も異なり、`applicationId`はUUID形式、`accessKey`は`pk_`プレフィックス付き文字列(旧世代の数字のみのアプリIDとは別物、2026-08-02にユーザー提供の実キーで実証済み)。`Referer`/`Origin`ヘッダー必須(未設定だと`REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`)。`formatVersion=2`でもレスポンスの配列キーは`Items`(大文字I、ドキュメント記載の小文字`items`とは異なる)で、各要素はフラットなオブジェクト(`.Item`ラッパーなし、`mediumImageUrls`は文字列配列)。
  - **既知の落とし穴: 半角スペース区切りの1文字トークンがあるとキーワード全体が`{"error":"wrong_parameter","error_description":"keyword is not valid"}`で拒否される**(2026-08-02に実証: 単独の「ザ」や「A」、"Spider-Man **2**"の末尾「2」、「...オブ **ザ** キングダム」の「ザ」等)。`fetch-covers.mjs`の`toSearchKeyword()`が1文字トークンを検索キーワードから除外して回避している。
  - **楽天市場は本・ゲームソフト専業カタログ(楽天ブックス)と違い一般小売の全出品を横断検索するため、書籍APIよりファジーマッチの取りこぼし・誤マッチのリスクが高い**。`EXCLUDE_KEYWORDS`(攻略本・グッズ・フィギュア等)で某かは弾けるが、以下は自動フィルタで検知できず**2026-08-02の初回投入時に手動で発見・修正が必要だった**:
    - **未収録の他機種版がヒットする**(ELDEN RINGでSwitch2版「Tarnished Edition」がヒットしたが、本サイトはSwitch2版を対応機種に含めていない → PS5指定で再検索し手動修正)
    - **別プラットフォーム版がヒットする**(グランツーリスモ7・ペルソナ5 ザ・ロイヤルはいずれもPS4版の中古品がヒットしたが、本サイトはPS5版のみ収録 → `<タイトル> PS5`で再検索し手動修正)
    - **無関係な同シリーズ商品がヒットする**(ポケットモンスター スカーレット・バイオレットは「ゼロの秘宝」DLCのダウンロード版アイコン画像がヒット → 単体版タイトル「ポケットモンスター スカーレット」で再検索しパッケージ写真に修正)
  - これらの理由により、**新規タイトル追加時は`fetch-covers.mjs`実行後に必ず`matchedTitle`と実際の画像を目視確認すること**(ranobe-dbのhonto.jpフォールバック運用と同じ原則)。中古品のパッケージ写真自体は(ウォーターマークが入っていても)正しい商品であれば採用してよい — 実際にFF7リバースの初回マッチは中古品の写真だったが、公式パッケージそのものだったため問題なかった

## コマンド

```sh
npm install
npm run dev       # http://localhost:5173/game-db/
npm run build      # 型チェック + データ整合性チェック + ビルド + prerender
npm run preview
node scripts/generate-ogp.mjs   # public/og-image.png の再生成(手動実行、ビルドパイプラインに含まれない)
```

`main`へのpushで`.github/workflows/deploy.yml`が自動ビルド・GitHub Pagesデプロイを行う予定(要新規作成、ranobe-db/manga-dbと同一パターン)。

`package.json`の`playwright`は`1.55.0`に**バージョン固定**(キャレットなし)している。このsandboxはNode 18のため、Node 20必須の最新版(`^1.55.0`のレンジ指定だとロックファイルなしのnpm installで最新の1.6x系に解決されてしまい、Node 18では動かない)ではなく、`engines: {node: ">=18"}`の版を明示的に固定した(2026-08-02、実際にこの問題で一度ビルドが失敗している)。

## SEO / SSG(ranobe-db/manga-dbから移植)

`useSeo.ts`(document.title/meta/canonical/OGP/JSON-LD設定)、`scripts/prerender.mjs`(`postbuild`フックでPlaywrightが全ルートをクロールし`dist/<route>/index.html`を書き出す、最後に`dist/index.html`を`dist/404.html`にコピー)、`scripts/generate-manifest.mjs`内のsitemap.xml生成の仕組みはranobe-db/manga-dbと同一パターン。canonical/og:urlは`window.location.origin`でなく`SITE_ORIGIN`定数から組み立てる(理由はranobe-dbのCLAUDE.md参照)。ゲーム詳細ページのJSON-LDは`VideoGame`型を使用(developer相当は`author`、`publisher`、`gamePlatform`、`genre`、`award`等)。scaffold時点で18ゲーム+一覧/詳細ページ計63ルートのプリレンダリングを確認済み。

## データ規模の推移

18本(2026-08-02、scaffold。PS5中心7本・Switch中心8本・Switch2/マルチプラットフォーム3本のバランスで選定): エルデンリング(ELDEN RING)、ゴッド・オブ・ウォー ラグナロク、Marvel's Spider-Man 2、ファイナルファンタジーVII リバース、グランツーリスモ7、Horizon Forbidden West、バイオハザード ヴィレッジ、ゼルダの伝説 ティアーズ オブ ザ キングダム、ゼルダの伝説 ブレス オブ ザ ワイルド、スプラトゥーン3、あつまれ どうぶつの森、ポケットモンスター スカーレット・バイオレット、スーパーマリオ オデッセイ、大乱闘スマッシュブラザーズ SPECIAL、ファイアーエムブレム 風花雪月、マリオカート ワールド、モンスターハンターライズ、ペルソナ5 ザ・ロイヤル。18本時点で会社18社・ジャンル12・アワード9。

## 既知の未着手事項

- **ストアリンク(PlayStation Store・Nintendo公式ソフト検索)は未実装**。追加する場合は必ず実装前にブラウザで実際に検索してURLパターンを確認すること(manga-dbの`WebComicPlatform`ルールを参照)
- **Google Analytics(gtag.js)は未設定**。`index.html`からranobe-db用のGA計測IDを含むタグを削除済み(別サイトの計測データに混入するため使い回し不可)。計測する場合はgame-db用に新規のGA4プロパティをユーザー自身が発行する必要がある
- **`og-image.png`は`scripts/generate-ogp.mjs`で生成済み**(2026-08-02、game-db用に新規作成)だが、データ規模が変わったら再実行が必要(自動化されていない)
- **受賞歴のうち「未確認」表記のあるものは確度が低い**: 初回18本のデータ投入時、一部のタイトルでBAFTA Games Awardsの個別部門・D.I.C.E. Awardsの受賞可否など、調査時点で一次ソースに到達できず記載を見送った受賞歴がある(各ゲームの`sourceNote`に記載内容を明記)。正確性を重視する場合は個別に再確認を推奨
- **新人賞/それ以外の賞でのフィルターは未実装**(ranobe-dbと同じく将来的な検討事項)
