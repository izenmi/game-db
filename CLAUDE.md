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

## シリーズ(series)の設計(2026-08-12実装)

`public/data/source/series.json`(`SeriesSource`: `id`/`name`/`nameKana`/`description`/`externalLinks`/`sourceNote`/`updatedAt`)を、ゲーム側の**`seriesId?: string`(単数・任意)**から参照する。会社が`developerIds`(配列・必須)+`publisherId`で参照されるのと違い、**1作品は最大1シリーズ・シリーズに属さない作品の方が多い**ため単数の任意フィールドにした。`/series`(一覧)と`/series/:id`(詳細)を持ち、詳細ページはジャンル詳細と同じくゲームをフル展開して`GameCard`で描く。並びは**シリーズ内は発売日昇順(= 発売順)**、一覧は収録本数の降順→`nameKana`順。

**シリーズとして立てる基準(2026-08-12に確立)**:

- **同一タイトル名を継承する作品群**(続編・リメイク・スピンオフを含む)を1シリーズとする。『ゼルダの伝説』に『ゼルダ無双』を、『マリオパーティ』に『スーパー マリオパーティ』を含めるのはこの基準による
- **版権IPを共有するだけの作品群はシリーズにしない**。Star Wars・LEGO・Marvel・Warhammer 40,000・ディズニー・テトリス・SDガンダムのような「同じ題材を別の開発元が別々に作っている」束は対象外。ただしその中でタイトルが連なるもの(`star-wars-jedi`・`kotor`・`jedi-knight`・`lego-marvel-super-heroes`)は個別のシリーズとして立てている
- **収録2本以上**をシリーズ化の条件にする。1本しかないシリーズはページを作っても遷移先が自分自身しかなく、一覧のノイズになる
- 名寄せは**タイトル表記から判断**する(`sourceNote`にもそう明記してある)。IGDBの`collections`/`franchises`は使っていない

**初期投入は157シリーズ・459/1192本(38%)**。候補は思いつきではなく、`games.json`のタイトルとidの前方一致を機械的に数え上げて列挙し、目視で精査して確定させた(「候補はカタログから列挙する」原則)。この手順で実際に誤りを2件防いでいる: `tales-of-kenzera`(『Tales of Kenzera: ZAU』はテイルズ オブ シリーズではない)、`horizon-chase-turbo`(『Horizon Chase Turbo』はHorizonシリーズではない)。**逆にid前方一致だけでは取りこぼす**ものもある(The Elder Scrollsの`skyrim-special-edition`/`oblivion-remastered`、ファイナルファンタジーの`ff7-*`、龍が如くの`yakuza-*`)ので、タイトル側からの照合と両方を回すこと。

**関連作品レコメンドとの関係**: 「このゲームが好きなら」からは**同一シリーズの作品を除外する**(`generate-manifest.mjs`の`relatedIdsFor()`)。詳細ページには「〇〇シリーズの他の作品」セクションが別にあるので、除外しないと同じ並びを2回見せることになり、レコメンド枠が本来の「別のゲームを見つける」役に立たなくなる。

**新規タイトル追加時**: `apply_batch.py`は`newSeries`キーと`game.seriesId`の参照検証に対応済み。`seriesId`は任意なので、シリーズに属さない作品はフィールドごと省略する(空文字を入れないこと。`generate-manifest.mjs`が未知idとして扱う)。

## 対応機種(platforms)の方針

`GamePlatform = "ps5" | "switch" | "switch2"`。テーマ/ジャンルのような別JSON参照エンティティではなく、`GameSource.platforms: GamePlatform[]`としてGame本体に直接埋め込む(1本のゲームが複数機種で出ることが普通にあるため配列)。一覧ページ・ジャンル詳細ページに対応機種でのセレクトフィルターを実装している。

**「対応機種」に含めるかどうかの判断基準**(2026-08-02、初回18本のデータ投入時に確立):
- **専用パッケージ版・専用エディションが実際に発売されている機種のみ**を対応機種とする。動作最適化パッチ(既存ソフトがSwitch2上で高解像度・高フレームレートで動くだけ)は対応機種に含めない(例: スプラトゥーン3、ポケットモンスター スカーレット・バイオレット)
- **クラウド版のみ**(ネイティブ移植なし)も対応機種に含めない(例: バイオハザード ヴィレッジのSwitch版はクラウド版のみのため`switch`は含めていない)
- **既発売タイトルに追加される予定の未発売の移植版・他機種版**は対応機種に含めない。`sourceNote`に発売予定日を明記する(例: ELDEN RINGのSwitch2版「Tarnished Edition」は2026-08-28発売予定だが、2026-08-02時点で未発売のため`platforms`に`switch2`を含めていない)。**タイトルそのものが未発売の場合は下記「未発売タイトルの扱い」に従い、発表済みの機種をそのまま`platforms`に入れる**(そうしないと`platforms`が空配列になりビルドが通らない)
- リマスター版・完全版が別発売日で出ている場合、`releaseDate`は収録している対応機種の中で最速の発売日を採用し、機種別の発売日の違いは`sourceNote`に明記する

## データ入力ルール(ranobe-db/manga-dbから踏襲)

- **出典は日本語版Wikipediaを基本とするが必須ではない**。Wikipediaに記事がない、または情報が薄いタイトルは公式サイト・信頼できる報道(Famitsu、4Gamer、GAME Watch等)で補ってよい。書き込む前に必ず何らかの情報源で裏取りし、`sourceNote`に何を確認したか・どの情報源を使ったか・何が未確認かを明記する
- **あらすじはコピペ禁止**。Wikipediaの文章表現をそのまま転記せず、150〜250字程度で必ず自分の言葉で要約する
- **実在確認できない候補は無理に埋めない**方針(ranobe-db/manga-dbと同じ)。目標本数に届かなくても、確認できたタイトルのみ収録する
- 新規idを追加する前に既存の`companies.json`/`genres.json`/`awards.json`を確認し、同一企業・同一賞の重複登録を避ける(任天堂・カプコン等は開発元・発売元の両方として何度も登場する)

## 未発売タイトルの扱い(2026-08-06にユーザー指示で方針変更)

**発売前のタイトルも収録してよい**。2026-08-06までは「本サイト運用時点で未発売のタイトルは収録しない」方針で、第4弾拡充では『鬼武者 Way of the Sword』(2026-09-04予定)と『Phantom Blade Zero』(2026-10-29予定)を見送っていたが、同日ユーザーから「未発売のものでも登録してよい」と指示があり方針を変更した(見送っていた2本も同日に追加済み)。

- `releaseDate`には**発表されている発売予定日**を入れる。`/timeline`は`releaseDate`の年でグルーピングするだけなので、未来の年代セクションが自然に生える
- `platforms`には**発表済みの対応機種**をそのまま入れる。ここを空にするとビルドが落ちる
- **`sourceNote`に「本サイト更新時点(YYYY-MM-DD)で未発売」と明記する**。発売日は延期されうるし、あらすじも発表済み情報に基づく暫定的なものになるため、後から見て区別が付くようにしておく
- **あらすじは発表済みの情報の範囲で書き、細部の仕様は`sourceNote`で「未確認」と断る**。未発売タイトルは事前情報しかないので、断定的に書かないこと
- 「実在確認できない候補は無理に埋めない」という原則は変わらない。**発表されていることをIGDB等で確認できたものだけを収録する**(噂・リーク段階のものは入れない)

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
- ゲームカード(`GameCard.tsx`)はカード全体がクリック領域になっている(ranobe-db/manga-dbの`WorkCard`と同じパターン)。2026-08-03に「中クリックで新規タブが開かない」不具合を修正するため、`role="link"`付き`div`+`onClick`方式から「ストレッチリンク」方式(カード全体を覆う透明な`<Link>`を`position: absolute; inset: 0;`で重ね、内部のジャンルチップ`<Link>`だけ`position: relative`でその上に表示)に変更した。中クリック・Ctrl+クリック・右クリックメニュー・キーボード操作がすべてネイティブな`<a>`の挙動になった

## 購入リンク・パッケージ画像

- **購入リンクはAmazon検索URLのみ**実装(`amazonSearchUrl(title, platform?)`、`src/ui/common/GameCover.tsx`)。アフィリエイトタグ`izenmi-22`(ranobe-db/manga-dbと共通)付きの検索URLを生成し、対応機種ごとに「PS5版をAmazonで購入」等のリンクをゲーム詳細ページに表示する(2026-08-05に文言を「探す」から「購入」へ変更、姉妹サイト4サイト共通)。PlayStation Store・Nintendo公式サイト内のソフト検索へのリンクは、manga-dbの`WebComicPlatform`ルール(実装前に必ずブラウザで実際に検索してURLパターンを目視確認する、憶測でURLを書かない)を踏襲し、**今回は未実装**(2026-08-02時点で未検証)
- **パッケージ画像は`scripts/fetch-covers.mjs`(2026-08-02実装)で取得済み**。ranobe-db/manga-dbの楽天ブックスAPI(書籍・ISBNベース、ゲームソフトには使えない)とは別に、**楽天市場の商品検索API(`IchibaItem/Search`、ジャンルID`101205`=テレビゲーム)**を使う。`npm run fetch-covers`(要`RAKUTEN_APP_ID`/`RAKUTEN_ACCESS_KEY`環境変数)でタイトル名から代表商品を検索し、`public/data/source/covers-cache.json`に保存する(コミット対象、ビルド時には叩かない)。
  - **エンドポイントは新gateway**: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`(ranobe-db/manga-dbが使う`app.rakuten.co.jp/services/api/BooksTotal/Search/...`とは別ドメイン・別世代のAPI)。認証情報の形式も異なり、`applicationId`はUUID形式、`accessKey`は`pk_`プレフィックス付き文字列(旧世代の数字のみのアプリIDとは別物、2026-08-02にユーザー提供の実キーで実証済み)。`Referer`/`Origin`ヘッダー必須(未設定だと`REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`)。`formatVersion=2`でもレスポンスの配列キーは`Items`(大文字I、ドキュメント記載の小文字`items`とは異なる)で、各要素はフラットなオブジェクト(`.Item`ラッパーなし、`mediumImageUrls`は文字列配列)。
  - **既知の落とし穴: 半角スペース区切りの1文字トークンがあるとキーワード全体が`{"error":"wrong_parameter","error_description":"keyword is not valid"}`で拒否される**(2026-08-02に実証: 単独の「ザ」や「A」、"Spider-Man **2**"の末尾「2」、「...オブ **ザ** キングダム」の「ザ」等)。`fetch-covers.mjs`の`toSearchKeyword()`が1文字トークンを検索キーワードから除外して回避している。
  - **楽天市場は本・ゲームソフト専業カタログ(楽天ブックス)と違い一般小売の全出品を横断検索するため、書籍APIよりファジーマッチの取りこぼし・誤マッチのリスクが高い**。`EXCLUDE_KEYWORDS`(攻略本・グッズ・フィギュア等)で某かは弾けるが、以下は自動フィルタで検知できず**2026-08-02の初回投入時に手動で発見・修正が必要だった**:
    - **未収録の他機種版がヒットする**(ELDEN RINGでSwitch2版「Tarnished Edition」がヒットしたが、本サイトはSwitch2版を対応機種に含めていない → PS5指定で再検索し手動修正)
    - **別プラットフォーム版がヒットする**(グランツーリスモ7・ペルソナ5 ザ・ロイヤルはいずれもPS4版の中古品がヒットしたが、本サイトはPS5版のみ収録 → `<タイトル> PS5`で再検索し手動修正)
    - **無関係な同シリーズ商品がヒットする**(ポケットモンスター スカーレット・バイオレットは「ゼロの秘宝」DLCのダウンロード版アイコン画像がヒット → 単体版タイトル「ポケットモンスター スカーレット」で再検索しパッケージ写真に修正)
  - **上記の手作業を自動化した(2026-08-04、姉妹サイトの表紙取得改善からの移植)**。ranobe-db/manga-dbに追加したBOOK☆WALKERフォールバックは書籍ストアなので**ゲームには使えず移植していない**。代わりに、このプロジェクト固有の繰り返し発生していた誤マッチを`fetch-covers.mjs`側で機械的に潰すようにした:
    - **機種違いの自動排除**: 商品名がXbox/PS4/PS3/PS Vita/PSP/3DS/Wii U/Wii/GameCube/ファミコン/Steam版等、本サイトが扱わない機種に言及していたら、タイトルが完全一致でも不採用にする(`FOREIGN_PLATFORM_PATTERNS`)。加えて、宣言済み`platforms`に含まれない機種を名乗る商品も不採用(Switch2表記を先に判定するので、`switch`のみのゲームがSwitch2限定版を拾うこともない)。採用順は「宣言済み機種を明記した商品 > 国内通常版 > 輸入版 > ダウンロード版」
    - **キーワードの段階的フォールバック**: フルタイトル → コアタイトル → **コアタイトル+機種名**。3段目は`refetch-cover.mjs`を手で回して機種違いを直していた手順そのもの
    - **短いタイトルの前方一致化**: 商品名の先頭ノイズ(`【中古】`・`[Switch]`・`PS5 ゲームソフト`・`新品`・キャンペーン文言等)を除去したうえで、タイトルが**その先頭に来ること**を要求する(`titleMatches()`)。単なる部分一致だと「LIMBO」→「東方深秘録 〜 Urban Legend in Limbo.」、「INSIDE」→「NBA Inside Drive 2004」を拾う(実際に拾っていた)
    - **`coreTitle()`は`:`で分割しない**(ranobe-db/manga-dbとの明確な違い)。ゲームのタイトルはコロンの後ろが作品を識別する部分なので、そこで切るとシリーズ名だけが残り**同一シリーズの別作品**を拾う。実際に「Metal: Hellsinger」→「METAL GEAR SOLID」、「Hollow Knight: Silksong」→「Hollow Knight」、「Dying Light: The Beast」→「Dying Light 2」、「グランブルーファンタジー ヴァーサス: ライジング」→無印「ヴァーサス」、「ディアブロ II: リザレクテッド」→「ディアブロIII」が発生した
    - **`--retry-misses`フラグを追加**: `coverUrl`が`null`のエントリだけを再試行する
    - **`--force`は破壊的でなくなった(2026-08-04)**: 従来は再取得で解決できないと既存エントリを`coverUrl: null`のスタブで上書きしていた。これが「目視確認で除去した誤マッチが再実行で復活する」現象(CLAUDE.mdに何度も記録されている)の直接の原因だった。現在は既存の表紙があればそれを維持し`[keep]`とログに出す。ただし**手動で直した`matchedTitle`の経緯メモは上書きされる**ので、意図せず全件を回さないよう`--retry-misses`を使い分けること
    - 副作用として、判定を厳しくした分だけ正しい商品も落ちることがある(「フロントミッション1st: Remake」は商品名が「フロントミッション 1st リメイク」で表記が違うため落ちた)。そういうケースは従来どおり`refetch-cover.mjs`にカスタムキーワードを渡して個別に埋める
  - **`refetch-cover.mjs`(手動フォールバック)の使い方**: `DRY=1`で候補一覧、`PICK=n`で採用候補を選ぶ。2026-08-04に**IGDBモードを追加**した(`IGDB=1`。楽天専用だったため日本語タイトルのIGDB検索ができなかった)。あわせて、`fetch-covers.mjs`側にはあった**1文字トークン除去(`toSearchKeyword()`)が入っておらず**「Blasphemous 2」「ドラゴンクエストXI … S」のようなキーワードがAPIに弾かれていたのを修正した
    ```sh
    DRY=1 IGDB=1 IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=xxx node scripts/refetch-cover.mjs pizza-tower "Pizza Tower"
    PICK=0 IGDB=1 ... node scripts/refetch-cover.mjs pizza-tower "Pizza Tower"
    ```
  - **IGDBが1段目、楽天市場が2段目(2026-08-04。当初は楽天優先で実装したが同日ユーザー指示で逆転)**: 楽天市場は「店が売っている商品」の検索なので、**パッケージ版が存在しないダウンロード専売タイトルは構造的に取得できない**(F-ZERO 99・Marvel Rivals・パルワールド・Brawlhalla・2XKO・ASTRO's PLAYROOM等)。インディー作品(Jusant・TOEM・Chants of Sennaar・Islets・Crow Country等)も同様に弱い。さらに商品名にショップ名・キャンペーン文言・中古/輸入版/DL版の別が混ざるため誤マッチ源にもなる。IGDBはゲーム専門DBなのでエントリがゲームそのものであり、縦長ボックスアート・機種情報つきでこれらのノイズが無い
    - 楽天市場は**フォールバックとして必要**: IGDBが英語名でしか持っていない作品は、本サイトの日本語タイトルと照合できない。2026-08-04時点で375本中65本がこの理由で楽天由来のまま(日本語パッケージ写真)
    - **認証**: [dev.twitch.tv](https://dev.twitch.tv/)で無料・即時にアプリ登録し、Client ID / Client Secretを取得する(IGDBの認証はTwitchが担う)。`IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`環境変数で渡す。`POST https://id.twitch.tv/oauth2/token?...&grant_type=client_credentials`でアクセストークンを取り、実行開始時に1回だけ取得してメモリに保持する
    - **検索**: `POST https://api.igdb.com/v4/games`、`Client-ID`と`Authorization: Bearer <token>`ヘッダー必須。ボディはApicalypse構文で`search "<kw>"; fields name, alternative_names.name, cover.image_id, platforms.name, url; where cover != null; limit 10;`
    - **採用条件は3つとも必須**: (1)`platforms.name`が本サイトの宣言済み`platforms`と対応する(`ps5`→`PlayStation 5`、`switch`→`Nintendo Switch`、`switch2`→`Nintendo Switch 2`。**プラットフォームIDの数値は決め打ちせず名前で照合する**)、(2)`name`/`alternative_names[].name`/ローカライズ名のいずれかが`titleMatches()`を通る、(3)`cover.image_id`が存在する
    - **`game_type`でDLC・拡張・バンドルを弾く(必須)**: 受け入れるのは`0`(本編)/`8`(リメイク)/`9`(リマスター)/`10`(拡張収録版)/`11`(移植)のみ。リメイク・移植を残すのは本サイトに該当作品があるため(ゼノブレイド ディフィニティブ・エディション、大神 絶景版、真・女神転生III HD REMASTER)。この絞り込みが無いと「あつまれ どうぶつの森」→ハッピーホームパラダイス(拡張)、「仁王」→Dragon of the North(DLC)、「ゼノブレイド3」→Future Redeemed(DLC)、「ポケットモンスター ソード・シールド」→ダブルパック(バンドル)を採用してしまう(実際に発生)
    - **続編を弾く**: 正規化後のIGDB名が「自サイトのタイトル+数字」になっている候補は続編とみなして不採用(「仁王」→「Nioh 3」、「Amanda the Adventurer」→「Amanda the Adventurer 2」)。自タイトル自体に数字が入っている場合(ブラスフェマス2、ゼノブレイド2)は数字が`target`側にも含まれるので影響しない
    - **全検索段の候補を統合してから選ぶ**: 検索は「英語games検索×2キーワード + ローカライズ検索×2キーワード」の4段だが、**最初にヒットした段で確定してはいけない**。本編が英語検索、特別版だけが日本語ローカライズ検索で見つかることがあり(「テイルズ オブ アライズ」「ソニックフロンティア」「ゼルダの伝説 夢をみる島」で発生)、早期確定だと選択肢が1つしかない状態でランキングすることになる
    - **並べ替えは「実際に一致した名前」と自タイトルの文字数差が小さい順**、同点なら英語名が短い順。一致した名前で比較するのが要点で、特別版は版名を明記した日本語名(「…ラグナロク デジタルデラックスエディション アップグレード」)経由で引っかかるため大きく不利になる。なお`game_type`が本編(0)のものを優先する並べ替えは**誤り**だった: 「ゼルダの伝説 夢をみる島」のSwitch版はリメイク(8)である一方、Artbook Setバンドルが本編(0)扱いだったため逆転する
    - **日本語タイトルは`game_localizations`エンドポイントを使う(重要)**: IGDBの`name`は英語で、`alternative_names`に日本語が入っていることは**ほとんどない**(「パルワールド」「トーエム」は通常検索・`alternative_names`検索とも0件)。地域別名称は`POST https://api.igdb.com/v4/game_localizations`に`where name ~ *"<kw>"* & game.cover != null;`で問い合わせ、ネストした`game`から`cover.image_id`と`platforms.name`を取る。`fetch-covers.mjs`は通常検索が外れたときにこちらへフォールバックする
    - **表紙URL**: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/<image_id>.jpg`(528x704)。IGDB公式のURLテンプレートだが、キャッシュに書く前に必ず実画像であることを確認する。**`content-length`ヘッダーで判定してはいけない**: `images.igdb.com`はHTTP/2で当該ヘッダーを返さないため、長さベースのチェックは正常な表紙を全件弾く(実際にこのバグで初回実行が0件になった)。`content-type`が`image/`で始まることと、ボディの実バイト数で判定する
    - **縦横比が合うことが採用理由の一つ**: IGDBの`t_cover_big`は264x352の縦長ボックスアートで、サイトの表紙枠(`.game-cover--sm` 92x131 / `--lg` 160x228)や既存の楽天カバー(247x400)と揃う。**表示側のCSSは変更不要**
    - レート制限は4リクエスト/秒。リクエスト間300msスリープ、429時は2秒待って再試行する
  - **Nintendo公式検索API・PlayStation Storeは検証済みだが不採用(2026-08-04、再検討時はここを読むこと)**: どちらも認証不要で実際に使え、両方あわせて未取得68本のうち**おおよそ45本**は取れる見込みだった。不採用の理由は**画像の縦横比**:
    - **Nintendo公式検索API** `https://search.nintendo.jp/nintendo_soft/search.json?q=<kw>` … JSONで`hard`(機種)・`sform`(`HAC_DL`ならDL専売)・`iurl`/`siurl`(画像ID)を返す。F-ZERO 99のようなDL専売も引ける。画像は`https://img-eshop.cdn.nintendo.net/i/<iurl>.jpg`が**1920x1080の横長**、`<siurl>`が**1024x1024の正方形**しかなく、縦長の表紙枠に入れると大きく切り落とされる。なお公式マーケティングページの`og:image`は汎用のSNSバナー(`sns.png`)で使えない
    - **PlayStation Store** `https://store.playstation.com/ja-jp/search/<kw>` … 検索ページから`/ja-jp/product/...`のリンクが取れ、商品ページに`image.api.playstation.com/vulcan/...`の画像がある。ただしこちらも**1024x1024の正方形**で、1ページに14〜42枚の画像があるため選別ルールが必要。さらに商品名がJP表記(`マーベル・ライバルズ`)で本サイトのEN表記(`Marvel Rivals`)と照合しづらく、`Days Gone Remastered`→`Days Gone Value Selection`(PS4の旧作)のような誤マッチも実際に発生した
    - 正方形画像を使う場合はユーザーの意向として「表示側のCSSを調整する」(`object-fit`を分ける等)方針が確認済み
  - **楽天ブックス ゲーム検索API(`BooksGame/Search`)も検証済み・不採用(2026-08-04)**: 楽天市場と違い`hardware`(機種)を構造化フィールドで返し商品名もきれいという利点はあるが、小売カタログである以上ダウンロード専売には無力で、**未取得68本のうち何らかの結果が返ったのは4本だけ**だった。なお`keyword`パラメータは受け付けず、`title`/`jan`/`hardware`/`makerCode`/`label`/`booksGenreId`のいずれかが必須
  - **楽天の認証情報は姉妹サイトと共用できる(2026-08-04に実証)**: 「Rakutenのアプリ登録はサイトごとなのでranobe-db/manga-dbのキーは使い回せない」と記載していたが、現行の新gateway形式の認証情報(UUIDの`applicationId`+`pk_`始まりの`accessKey`)は3サイトいずれのRefererからも通ることを実測で確認した。ただし**3サイトのfetch-coversを同時に走らせると429(レート制限)が返る**ので必ず1つずつ実行すること(3スクリプトとも429時のバックオフ再試行を実装済み)
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

`index.html`の`<head>`にGoogle Analytics(gtag.js)タグを設置済み(2026-08-03、game-db専用のGA4計測ID `G-V6407CNZ8Y` をユーザーが発行)。`scripts/prerender.mjs`は`page.content()`でDOM全体をシリアライズするため、prerenderされた`dist/<route>/index.html`にもタグがそのまま含まれる。ranobe-db/manga-dbはそれぞれ別のGA4プロパティを使っており、計測IDの使い回しはしない。

## 一覧ページの件数表示(2026-08-03実装)

`GameListPage`の件数表示(`page-subtitle`)は、絞り込み条件が1つでもある場合(`hasActiveFilters`)は「◯件 / 全□件」(絞り込み後件数 / 全体件数)、条件がない場合は「◯件」のみを表示する。全体件数は`gamesState.data.length`(絞り込み前の全件)を使う。姉妹サイトのranobe-db/manga-dbの`WorkListPage`にも同一パターンで実装済み。

## トップページのコンテンツ拡充(2026-08-03実装)

`HomePage.tsx`が検索ボックスと件数バッジだけで寂しいというユーザー要望を受け、`.count-badges`の直後・`.source-note`の直前に4セクションを追加した(サブコンポーネント分割はせず`HomePage.tsx`単一ファイルのまま拡張)。

- **ピックアップゲーム**: `getGames()`で全ゲームを取得し、`pickRandomGames()`(部分Fisher–Yates)で6件をランダム抽出して`GameCard`で表示。**抽選結果はモジュールレベルの`cachedPickup`に保持し、SPAセッション中は再抽選しない**(2026-08-04にユーザー指示で変更)。以前は`useMemo`の依存が`gamesState`だったためページ再マウント時に再抽選され、ブラウザの戻るボタンでトップに戻ると直前まで見ていたゲームが別のものに差し替わってしまっていた。フルリロードすると新しいモジュールインスタンスになるので抽選し直される
- **受賞作スポットライト**: 全ゲームの`awardSummaries`を`flattenRecentAwards()`でフラット化し年降順で上位6件を表示。`AwardDetailPage.tsx`の`winner-list`パターンを流用(賞名リンクを追加した点だけ拡張)
- **人気ジャンル**: `getGenres()`を`gameCount`降順で上位12件、チップリンクで`/games?genre=<id>`へ
- **姉妹サイト紹介カード**: より目立つカード(残り2サイトへのリンク、各リンク先サイト自身のアクセントカラーで縁取り)を新設。データはHomePage内のローカル定数。**全ページ下部の`SiteFooter`(姉妹サイトへの小さいテキストリンク)は2026-08-03にユーザー指示で削除済み**(`App.tsx`からの呼び出し・コンポーネント本体・`common.css`の`.site-footer*`ルールを削除)。姉妹サイトへの導線はこのホームページのカードのみに一本化されている

`colorForYear`/`YEAR_COLORS`は従来`AwardDetailPage.tsx`にprivateで定義されていたが、受賞作スポットライトからも使うため`src/ui/common/yearColor.ts`に抽出した。姉妹サイト(ranobe-db/manga-db)にも同一パターンで実装済み(エンティティ名・ルート名・アクセントカラーのみ置き換え)。

説明文(`.home-intro`)からも「次に」を削除し、「遊びたいゲーム探しに使えるデータベースです。ジャンル・会社・対応機種などで絞り込めます。」に変更した。

## ページ遷移時のスクロール位置リセット(2026-08-03実装)

react-routerはルート遷移時にスクロール位置を保持したままなので(ブラウザのフルページ遷移と違い自動リセットされない)、トップページを下にスクロールした状態でリンクをクリックすると遷移先も同じスクロール位置のまま表示される不具合があった。`src/ui/common/ScrollToTop.tsx`(`useLocation`の`pathname`変更を`useEffect`で監視し`window.scrollTo(0, 0)`)を作成し、`App.tsx`の`<BrowserRouter>`直下・`<TopNav />`の前にマウントしてサイト全体で解決した。姉妹サイト(ranobe-db/manga-db)にも同一パターンで実装済み。

## データ規模の推移

18本(2026-08-02、scaffold。PS5中心7本・Switch中心8本・Switch2/マルチプラットフォーム3本のバランスで選定): エルデンリング(ELDEN RING)、ゴッド・オブ・ウォー ラグナロク、Marvel's Spider-Man 2、ファイナルファンタジーVII リバース、グランツーリスモ7、Horizon Forbidden West、バイオハザード ヴィレッジ、ゼルダの伝説 ティアーズ オブ ザ キングダム、ゼルダの伝説 ブレス オブ ザ ワイルド、スプラトゥーン3、あつまれ どうぶつの森、ポケットモンスター スカーレット・バイオレット、スーパーマリオ オデッセイ、大乱闘スマッシュブラザーズ SPECIAL、ファイアーエムブレム 風花雪月、マリオカート ワールド、モンスターハンターライズ、ペルソナ5 ザ・ロイヤル。18本時点で会社18社・ジャンル12・アワード9。

**122本(2026-08-03、+104本の大型拡充)**: ユーザー依頼「100作品追加」に対し、PS5看板タイトル・PS5サードパーティ・PS5和ゲー/マルチ・Switch任天堂系×2・Switch任天堂系+インディー・Switch2/新作・インディー/リマスターの8バッチ(各13本、subagent調査→`apply_batch.py`反映→`npm run build`→`git commit`をバッチごとに逐次チェックポイント)で104本を追加(実在確認できず見送ったタイトルは0件、目標を上回ったが全て個別に実在確認済みで水増しではない)。会社84社(+66)・ジャンル28(+16: roguelike/platformer/fighting-game/horror/crime-action/co-op/metroidvania/strategy/party-game/fitness/musou-action/sports/adventure/deck-building/sandbox/puzzle)・アワード9(既存の範囲で対応、新規追加なし)。新規会社idはNaughty Dog・スクウェア・エニックス・カプコン・任天堂・アトラス・セガ等の既存id再利用を各subagentに徹底させ、バッチを並列実行せず逐次実行することでID衝突を回避した。

パッケージ画像は`fetch-covers.mjs`で新規104本中100本を取得(4本は該当商品なし: persona-3-reload、dragon-quest-11-s-definitive-edition、pokemon-legends-za、kirby-air-riders)。`matchedTitle`をプラットフォーム表記(Xbox/Vita等の異機種、宣言済みplatformsと disjoint)で機械的にスクリーニングし、明確な誤マッチ6件(the-last-of-us-part-1がPart IIの画像を誤取得、alan-wake-2/disco-elysium-final-cutがXbox版、persona-4-goldenがVita版、slay-the-spireが北米輸入版、puyo-puyo-tetris-2がSwitch2限定版「2S」)をキャッシュから除去してプレースホルダー表示に戻した。合計10本がプレースホルダー。

**225本(2026-08-03、追加で+103本の第2弾拡充)**: ユーザーから続けて「100本追加」の依頼を受け、まず件数を確認(直前の104本追加との重複意図がないか)した上で実施。PS5サードパーティ×2・Switch任天堂系×2・インディー×2・JRPG対戦格闘・PS5ホラーアクション・2024-25新作の8バッチ(I〜P、各12〜13本、同一の逐次チェックポイント方式)で103本を追加(実在確認できず見送ったのはAmnesia: The Bunker[対応機種なし]の1件のみ)。会社177社(+93)・ジャンル30(+2: stealth/rhythm-action)・アワード9のまま。**このバッチ以降、セッションのWebSearch利用枠(200回)を使い切ったため、Batch L以降はWebFetchによる直接URL取得(Wikipedia記事名を推測してアクセス)に切り替えて調査を継続した**(sourceNoteに「WebFetchで確認」「未確認」を明記する運用に変更)。

パッケージ画像は第2弾103本中88本を新規取得。同じくmatchedTitleのプラットフォーム照合で誤マッチ12件を追加除去(Civilization VII/Kingdom Come: Deliverance II/Sea of Thieves/Indiana Jones and the Great Circle/palworld/suicide-squad-kill-the-justice-league/mortal-kombat-1/sea-of-starsがXbox版、alone-in-the-dark-2024が2001年の旧作PS1版、live-a-live-2022が1994年SFCオリジナル版、limboが無関係な東方Projectスピンオフ、insideがPS4輸入版バンドル)。**前回除外した6件も本バッチのfetch-covers再実行で同一の誤マッチが再発**(キャッシュから消すと次回実行時に必ず再取得を試みるため)し、再度除外した。楽天市場APIの誤マッチ率の高さ(「購入リンク・パッケージ画像」セクション参照)は代表作中心の収録が進むほど、知名度の低いタイトルや同名紛らわしいタイトル(Mortal Kombat 1 vs 11等)で顕在化しやすい。

**375本(2026-08-03、第3弾+150本の大型拡充)**: ユーザーから「150本追加、逐次処理・トークン節約重視」の依頼を受け、PS5サードパーティ大作・Switch/Switch2任天堂系・インディー・JRPG・対戦格闘アクション・ホラーサバイバル・スポーツレーシングシム・戦略SRPG・2024-2026新作・リマスター移植の10バッチ(Q〜Z、各15本、同一の逐次チェックポイント方式)で150本を追加(実在確認できず見送ったタイトルは0件)。会社292社(+115)・ジャンル31(+1: programming、Game Builder Garageのビジュアルプログラミングを表現するため新設)・アワード9のまま(新規受賞歴は既存の範囲でのみ追加、賞そのものは無理に増やさなかった)。このセッションはBatch Wの時点で既にWebSearch枠(200回)を使い切っていたため、Q〜Zの全バッチでWebFetchによる直接URL取得を基本とした。

**Batch Wで会社データスキーマ不備が発生**: subagentが`newCompanies`に追加した12社が`id`/`name`のみで`nameKana`等5フィールドを欠落させ、`generate-manifest.mjs`の会社ソート処理がクラッシュした。`apply_batch.py`は参照整合性(developerIds/publisherId等の存在確認)のみを検証し、`CompanySource`型の必須フィールド充足はチェックしないため、このパターンのミスをすり抜ける。判明後はWebFetchで12社を個別に調査し直して手動修正し、Batch X以降は各subagentへの指示に「`src/types.ts`のCompanySource型を確認し、newCompaniesの7必須フィールドを自己チェックしてから出力」を明記して再発を防いだ。**今後apply_batch.pyを改修するなら会社の必須フィールド検証を追加する価値がある(未実装)**。

パッケージ画像は第3弾150本中110本を新規取得(40本は該当商品なし)。`matchedTitle`の目視確認で3種類の誤マッチを発見・修正:
- **対応機種と異なる版がヒット**(Xbox/PS4/Vita等、本サイトの対応機種enum`ps5`/`switch`/`switch2`に含まれない): 21件。`scripts/refetch-cover.mjs`(この拡充時に新規作成、id+カスタムキーワードを指定して1件ずつ再検索できる補助スクリプト)で「タイトル + 宣言済み機種名」のキーワードで再検索し、正しい機種の商品に差し替えた
- **別作品(続編等)の画像が誤ヒット**: 3件(Tormented Souls→「Tormented Souls 2」、仁王→「仁王2 Remastered Complete Edition」、鬼武者→未発売の新作「鬼武者 Way of the Sword」)。いずれも`toSearchKeyword()`の部分一致判定が続編タイトルも拾ってしまうケースで、機種名を加えた再検索で正しい商品に差し替えた
- **グッズ・特典画像が誤ヒット**: 2件(スーパー マリオパーティ→続編「ジャンボリー」の特典ステッカー、Poppy Playtime→ダイカットステッカー)。適切な代替候補が見つからなかったためプレースホルダーに戻した(Skullgirls 2nd EncoreもSwitch版の商品画像が見つからずプレースホルダーのまま)

**675本(2026-08-06、第4弾+300本の大型拡充)**: ユーザー依頼「300本追加、逐次処理・トークン節約重視・並列実行禁止」に対し、20バッチ(01〜20、各15本)を完全逐次で追加した。会社466社(+74)・ジャンル31(増減なし)・アワード9のまま。**このラウンドではサブエージェントを一切使っていない**(ユーザーが並列実行を禁止したことと、下記のIGDB照会スクリプトで調査コストが大きく下がったため)。

- **`scripts/verify-candidates.mjs`を新規作成し、Wikipedia調査の代わりにIGDBの一括照合を使った(このラウンド最大の変更点)**。1行1候補のテキストファイルを渡すと、候補ごとに「実在するか・本サイトの対応機種(`ps5`/`switch`/`switch2`)に該当版があるか・発売日・開発元・発売元・IGDBジャンル」を**1行にまとめて**出力する。15本のバッチを1回のコマンドで検証でき、WebSearch/WebFetchを1回も使わずに300本を裏取りできた。使い方は `IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=... node scripts/verify-candidates.mjs candidates.txt`。
  - **重複チェックも兼ねる**: `games.json`のタイトルを正規化して突き合わせ、既存なら`DUP`行を出して照会自体を省く(「詳しく調べる前に登録済みか確認する」という依頼への対応)。**ただし日本語タイトルで登録済みの作品を英語キーワードで照会すると検知できない**(実際に「Sonic Frontiers」が既存の「ソニックフロンティア」と一致せず、目視で除外した)。英語で引く場合は自分で既存一覧を確認すること
  - **`game_type`で本編/リメイク/リマスター/拡張収録版/移植のみを採用する**(`fetch-covers.mjs`と同じ方針)。合集・バンドル扱いのタイトル(スーパーマリオ 3Dコレクション、Another Code: リコレクション等)は弾かれるので、`ANYTYPE=1`環境変数で判定を緩めて再照会する
  - **未発売タイトルは発売日で自分で弾く必要がある**。スクリプトは将来日付でもOKを返すので、出力の日付が実行日より後なら除外する(このラウンドでは『鬼武者 Way of the Sword』2026-09-04・『Phantom Blade 0』2026-10-29の2本を未発売として見送った)
  - **タイトルが短いと無関係な作品を拾う**。「The Finals」→『Final Fantasy』の誤マッチが実際に発生した。出力のIGDB名が候補名と食い違っていないか必ず目視すること
- **`releaseDate`は原則IGDBの登録値をそのまま採用し、`sourceNote`にその旨を明記した**。国内発売日と一致しない場合があるが、確度の不明な日付を書くよりIGDB由来と明示するほうが追跡可能と判断した(ゼルダ無双 厄災の黙示録・メトロイドプライム リマスタード等、国内日が確実な数本だけ手動で国内日を採用している)
- **ビルドはバッチごとに`node scripts/generate-manifest.mjs`だけを回した**。参照整合性の検証はこれで十分で、Playwrightのプリレンダー(675本時点で1189ルート・約4分)は最後に1回だけ実行した。20回フルビルドすると1時間以上かかるため
- バッチ構成: 探索型アクション/任天堂ファースト/JRPG/カプコン・コナミ/洋ゲーFPS/セガ・バンナム/インディー/ホラー/スポーツ・レーシング/2025-26新作/対戦格闘・アニメ原作/シミュレーション・ストラテジー/生活シミュ・マルチ移植/アドベンチャー・ミステリー/メトロイドヴァニア・復刻/日本のインディー/協力型シューター/パズル・音楽ゲーム/ソウルライク/キャラクターゲー・レース

**1197本(2026-08-07、第5弾+520本の大型拡充)**: ユーザー依頼「500本追加、逐次処理・トークン節約重視・並列実行禁止・調べる前に登録済みか確認」に対し、9バッチ(01〜09、各12〜83本)を完全逐次で追加した。会社814社(+348)・ジャンル31(増減なし)・アワード9のまま。機種別内訳はSwitch 851・PS5 672・Switch2 119(重複あり)。

**このラウンド最大の変更点は`scripts/suggest-candidates.mjs`の新規作成**。従来は候補タイトルを自分で思いつき`verify-candidates.mjs`に投げていたが、**677本まで育った時点では思いつく候補の大半が既に登録済みで、50件投げて12件しか新規が残らない**という無駄が出た。そこで発想を逆にして、**IGDBに「対応機種で出ていて、まだ`games.json`に無いタイトル」を人気順で列挙させる**方式に変えた。

```sh
IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=... \
  node scripts/suggest-candidates.mjs --limit 600 --min-count 8 [--offset N] [--platform switch]
```

- `total_rating_count`(評価数)降順で`games`を舐め、`game_type`が本編/リメイク/リマスター/移植のものだけを残し、`games.json`のタイトルと正規化一致するものを除いて出力する。出力形式は`verify-candidates.mjs`と同じ1行1件
- **`--offset`を増やすと知名度の低い層に降りられる**。今回は`--offset 0 --min-count 8`で600件、`--offset 1500 --min-count 5`で130件を取り、そこから選別した
- **英語名でしか照合できないので、日本語タイトルで登録済みの作品は取りこぼす**(『ゼルダの伝説 ブレス オブ ザ ワイルド』は"The Legend of Zelda: Breath of the Wild"として候補に出てくる)。**この最終防波堤が`apply_batch.py`のid衝突検出**で、実際に7本がこれで弾かれた。逆に言えば**候補一覧を目視して既存の日本語タイトルを思い出す作業は省けない**

**この回で分かったこと**:

- **バッチのJSONは手書きせず、`gen0N.py`という使い捨てスクリプトをscratchpadに書いて生成した**。会社と作品をそれぞれタプルの配列で持ち、`newCompanies`は既存idを自動で除外し、書き出し直後に「未登録ジャンルid」「未登録会社id」を自己点検して表示する。**ヒアドキュメントで直接pythonを流すと、書き損じたときに全部書き直しになる**(実際に1回やって60件を打ち直した)。必ずファイルに落とすこと
- **会社名は日本語で登録されているものがある**(任天堂・カプコン・スクウェア・エニックス・ソニー・インタラクティブエンタテインメントなど)。英語名で`companies.json`をgrepすると「未登録」と誤判定するので、**idで引くこと**(`sie`・`bethesda-softworks`のように略称idのものもある)
- **`apply_batch.py`のリジェクト理由は`duplicate game id`と`invalid: ['publisherId:...']`の2種類にほぼ集中する**。前者は日本語タイトルで既に入っているケース、後者は会社idの綴り間違い。**リジェクトされた分は捨てずに、原因を直して`{"games":[...]}`だけの小さなbatch.jsonで再投入する**
- **あらすじに英単語やキリル文字が紛れ込む事故が起きる**。「北欧神話の world」「station wagon 一台」「замена が効かない」を実際に書いてしまった。書き出し後に`re.search(r'[Ѐ-ӿ가-힯]')`と`[a-z]{4,} `で機械的に点検すること
- **1バッチあたり60〜80本まで増やしても破綻しない**。第4弾は15本×20バッチだったが、今回は`gen0N.py`方式にしたことで1バッチ83本まで扱えた。commit/pushはバッチごとに行い、チェックポイントの粒度は維持している

## 関連作品レコメンド「このゲームが好きなら」(2026-08-06実装)

ゲーム詳細ページの末尾(`source-note`の直前)に、似たゲームを6件表示する。姉妹サイト4サイトすべてに
同一パターンで実装済み。

- **スコアはビルド時に`scripts/generate-manifest.mjs`で計算**し、`generated/games.json`の
  各要素に`relatedGameIds: string[]`(スコア降順)として持たせる。実行時の計算はしない
- **ジャンルタグのIDF重み付きコサイン類似度**を使う。ジャンルタグの語彙は意図的に少なく使い回す方針
  (「ジャンルタグの方針」の節)なので、共通タグ数を単純に数えると「アクションRPG」のような多数のゲームが持つタグに
  引っ張られて、どのページでも同じゲームが並んでしまう。IDFで希少なタグを重く見ることでこれを避ける。
  全ゲームが持つタグはidf=0になり自動的にスコアから消える
- **開発元が共通なら+0.15のボーナス**。タグの重なりが薄い場合でも同じ開発元のゲームは有力な候補なので、
  タグ共通ゼロでも候補に入れる(ボーナスは最大0.15でコサイン類似度の最大1.0より小さいため、
  タグが強く一致するゲームを押しのけることはない)
- **同点はid昇順で決める**。プリレンダー結果がビルドごとに変わらないようにするため
- **`relatedGameIds`は`generated/games.json`にしか入れない**。各ゲームは会社・ジャンル等の
  相互参照リストに何度も埋め込まれるため(`fullGame()`)、そこから除外しないと
  生成JSONが大きく膨らむ。詳細ページは`getGames()`(取得済みキャッシュ)から解決するので追加の通信は発生しない
- チューニング用の定数は`generate-manifest.mjs`冒頭の`RELATED_COUNT`と各ボーナス値



## 既知の未着手事項

- **パッケージ画像は675/675本(100%)で解決済み(2026-08-06、第4弾+300本ぶんを追加取得)**: 新規300本の内訳は**IGDB 263・楽天市場37**。`npm run fetch-covers`の一発目でIGDB 249・楽天37・未解決14となり、未解決の14本は全て「日本語タイトルで登録しているがIGDBには英語名しかない」ケースだったため、`IGDB=1 node scripts/refetch-cover.mjs <id> "<英語名>"`で個別に埋めた(笑み男/Another Code リコレクション/カービィファイターズ2/RAIDOU Remastered/遊戯王 マスターデュエル/オブリビオン リマスター/龍が如く0 DC/Pokémon ポコピア/Tony Hawk 3+4/リバーシティガールズ2/ダンガンロンパ Decadence/悪魔城ドラキュラ ドミナスコレクション/みんな大好き塊魂アンコール/クラッシュ・バンディクー ブッとびレーシング)。**CLAUDE.mdの既存記述どおり、日本語タイトルが自動で埋まらなかったらまず英語名でrefetchを試すのが正解だった**。
  - **`we-love-katamari-reroll`は`PICK=1`が必要だった**: `[0]`が『Katamari Damacy Reroll & We Love Katamari Reroll』の2本組バンドルで、本サイトは『塊魂 リローデッド』を別エントリとして持っているため単体版を選び直した
  - **楽天由来の37件を実画像で目視確認し、2件を差し替えた(2026-08-06)**。**商品名に機種名が入っていない場合、`FOREIGN_PLATFORM_PATTERNS`は機能せず画像だけが他機種版ということが起こる**: `star-wars-jedi-fallen-order`は商品名が「Star Wars ジェダイ:フォールン・オーダー デラックス エディション【限定版同梱物】…」で機種表記がなく、実画像は**PS4版のパッケージ**だった(本サイトはPS5のみ収録)。`legend-of-mana`は「コレクターズ エディション」がヒットし、実画像は**フィギュアやアートブックを並べた同梱物の集合写真**でパッケージではなかった。どちらもIGDBで取り直して解決。**商品名だけの機械チェックでは足りないので、楽天由来のエントリは実画像まで開いて確認すること**
- 以下は2026-08-04時点の記録(375本時点): 内訳は**IGDB 310・楽天市場65**。292→307が楽天側のマッチング自動化、307→375がIGDB層の追加、その後ユーザー指示でIGDBを優先順位1位に変更し既存の楽天エントリ245件をIGDBへ差し替えた(IGDBで引けなかった分は楽天のまま維持)。
  - **版違いを採用している5本**(`ゴッド・オブ・ウォー ラグナロク`→Digital Deluxe Edition、`ペルソナ３ リロード`→同、`クラッシュ・バンディクー ブッとび3段もり！`→Bonus Edition、`Marvel's Spider-Man: Miles Morales`→Launch Edition、`ポケットモンスター ソード・シールド`→Double Pack)は、**IGDB側に日本語名を持つ本編エントリが存在せず**変種SKUしか選べなかったもの。同じゲームのキーアートなので許容する判断をユーザーと確認済み(2026-08-04)。なお`クロノ・クロス ラジカルドリーマーズエディション`・`サイバーパンク2077 アルティメットエディション`・`ゼノブレイド ディフィニティブ・エディション`等は作品の正式名に版名が含まれるので正しいマッチ
  - かつて国内版が見つからず**輸入版のパッケージ**を採用していた6本(Alan Wake 2 / Alone in the Dark / Civilization VII / Kingdom Come: Deliverance II / Mortal Kombat 1 / Poppy Playtime)は、IGDB優先化で全てIGDBの正規カバーに置き換わった。楽天由来のエントリで輸入版を採用した場合はログに`[ok-import]`が出るので、その都度確認すること
  - **最後の24本は`refetch-cover.mjs`で個別に埋めた**。いずれも「日本語表記のゆれ」で、自動では引けなかったもの: 実商品名/IGDB名が別表記のケース(塊魂 リローデッド→`Katamari Damacy Reroll`、ペルソナ5 ストライカーズ→`Persona 5 Strikers`、カービィエアライダー→楽天では「カービィのエアライダー」)と、IGDBに日本語ローカライズ名が無く英語名でしか引けないケース(ピザタワー→`Pizza Tower`、カセットビースト→`Cassette Beasts`、チェインドエコーズ→`Chained Echoes`)。**新規タイトル追加時に日本語タイトルが自動で埋まらなかったら、まず英語名で`IGDB=1 node scripts/refetch-cover.mjs <id> "<English title>"`を試すこと**
  - 半角の`&`と全角の`＆`は`normalize()`で除去している。合集タイトルは表記が割れる(本サイト`幻想水滸伝I・II`/`ドラゴンクエストI＆II`/`バテン・カイトスI&II` ↔ 店側`I＆II`/`I&II`)
- **ストアリンク(PlayStation Store・Nintendo公式ソフト検索)は未実装**。追加する場合は必ず実装前にブラウザで実際に検索してURLパターンを確認すること(manga-dbの`WebComicPlatform`ルールを参照)
- **`og-image.png`は`scripts/generate-ogp.mjs`で生成済み**(2026-08-02、game-db用に新規作成)だが、データ規模が変わったら再実行が必要(自動化されていない)
- **受賞歴のうち「未確認」表記のあるものは確度が低い**: 初回18本のデータ投入時、一部のタイトルでBAFTA Games Awardsの個別部門・D.I.C.E. Awardsの受賞可否など、調査時点で一次ソースに到達できず記載を見送った受賞歴がある(各ゲームの`sourceNote`に記載内容を明記)。正確性を重視する場合は個別に再確認を推奨
- **新人賞/それ以外の賞でのフィルターは未実装**(ranobe-dbと同じく将来的な検討事項)

## 日本語化されていないゲームは収録しない(2026-08-08にユーザーと合意)

日本語で遊べないタイトルは登録しない。既存分も一度点検し、22本を削除した。

**判定には `scripts/check-japanese.mjs` を使う**(IGDBの`language_supports`を参照)。ただし
**この判定は単独では信用できない**ので、機械的な一括削除に使ってはいけない。

- **タイトルが英語表記かどうかでは判定できない**。『ELDEN RING』『Ghost of Tsushima』のように
  英語タイトルのまま国内販売されている作品が全体の65%を占める。見た目で切ると主要作が消える
- **IGDBの言語データは網羅的でない**。実測では『Demon's Souls』(PS5・ソニー国内発売)が
  English/French/Portuguese/Spanish の4件しか登録されておらず`no-ja`と出た。
  『テラリア』『魔界戦記ディスガイア7』『ゼノブレイド ディフィニティブ・エディション』など
  **日本語タイトルの作品まで`no-ja`**になる
- **名前検索は誤マッチする**。『Returnal』→別ゲーム"Return or No Return"、『Demon's Souls』→
  1987年の同名別作品。covers-cacheに`fetch-covers`が確定させたIGDBのslugがあるので、
  **slugで直接引く**こと(check-japanese.mjs はそう実装してある)
- 楽天市場の国内版パッケージ有無も決め手にならない(『Mortal Kombat 1』はヒット0件、
  一方で輸入版が並ぶだけのケースも多い)

**実際に採用した基準**: `no-ja` かつ 日本語タイトルでない かつ 国内メーカー製でない100件のうち、
**IGDBに20言語以上が登録されているのに日本語だけ無い22件**に限って削除した。多言語展開して
いるのに日本語が欠けているものは、データ欠落ではなく実際に未対応である蓋然性が高いという判断。
言語数が1〜19件のものはデータ欠落の可能性が高いため残している。

**新規登録時**は、この基準で `no-ja` と出たものを候補から外す。

## マイナーなタイトルは登録しない(2026-08-08にユーザーと合意)

**この方針は候補列挙の段階でだけ効かせる。既存データに遡って一括削除してはいけない。**

`scripts/suggest-candidates.mjs` に3つの入口フィルタを入れてある。

1. `--min-count`(IGDBの `total_rating_count` の下限)の既定を **5 → 40** に引き上げた
2. **未発売を出さない**。`first_release_date` が未来のもの、日付を持たないものを落とす
3. 日本語未対応を出さない(`scripts/check-japanese.mjs`。「日本語化されていないゲームは
   収録しない」の節を参照)

入口で落とすぶんには「候補に出ない」だけで既存データは消えないので、多少きつくても実害が
小さい側に倒してある。

### マイナー判定に使えなかった指標(再調査しないこと、2026-08-08に全部実測)

既存1192本に遡って「マイナー」を機械判定しようとして、4つとも失敗した。**どれも有名作を
誤って落とすので、これらを根拠に削除してはいけない。**

- **IGDB `total_rating_count`**: 『ゴッド・オブ・ウォー ラグナロク』『ペルソナ３ リロード』
  『ポケットモンスター ソード・シールド』が 0 件。IGDB側で版・地域エントリが分かれていて、
  票が親エントリに付いているため。**候補列挙(新規)には使えるが、既存の削除判定には使えない**
  (前者は取りこぼしで済むが、後者はデータ消失になる)
- **IGDB `follows`**: 全1192本が 0。事実上廃止されたフィールド
- **日本語版Wikipediaの記事有無**: 674本が「記事なし」と出たが、『HELLDIVERS 2』
  『アーマード・コアVI』など記事のある作品も落ちる。DB側のタイトル表記と記事名が一致しないため
- **楽天市場のキーワード検索**(`scripts/check-rakuten-stock.mjs`): 1192本中92本がAPI失敗
  (『ゼルダの伝説 ティアーズ オブ ザ キングダム』を含む)。さらにヒットが20件あっても商品名と
  突合できず0件扱いになるものが多い(『Ghost of Yōtei』→楽天は「Ghost of Yotei」、
  『Pokémon LEGENDS Z-A』→「ポケモンレジェンズ Z-A」)。「国内版0件」527本の大半は
  照合の失敗であって、実際に売っていないわけではない
- **covers-cache の `source`**: IGDBを先に引く実装なので、`rakuten-ichiba` でないことは
  「楽天に無い」を意味しない。取得順を表しているだけ

**既存分で消したいタイトルはユーザーが名指しする運用**にしてある(『Gothic 1 Remake』
『Mina the Hollower』『007 ファーストライト』『Directive 8020』
『NTE: Neverness to Everness』『South of Midnight』はこの方法で削除した)。
