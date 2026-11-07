# 遊んで学ぶ 制御と電気

リレー盤のボタンを押したり、モーターやセンサーの設定を変えたりして、電気制御の動きをブラウザーで試せる教材です。

**[教材メニューを開く](https://learn.fa-labo.com/)**

| 教材 | できること |
| --- | --- |
| [カチッとリレー](https://learn.fa-labo.com/apps/click-relay.html) | 20面のリレー盤で、ボタンを離すとランプが消える回路と、点いたままになる自己保持回路などを比較できます。 |
| [機器あそび場](https://learn.fa-labo.com/apps/device-playground.html) | 9つの部屋で、温調器、モーター、テスターなどを操作し、設定や配線で何が変わるか観察できます。 |
| [リレー式エレベーター](https://learn.fa-labo.com/apps/relay-elevator.html) | 完成した3階建てのエレベーターを操作し、役割ごとの回路で動作を観察できます。配線変更はありません。 |

手元で使うときは、このリポジトリをダウンロードして展開し、`index.html` をブラウザーで開いてください。

各教材の画面上部で **Japanese / English** を選べます。英訳は教材に同梱されているので、オフラインでも制御盤・展開接続図・部品の説明まで切り替えられます。

[教材の使い方](docs/README.md) · [変更履歴](CHANGELOG.md) · [TODO](TODO.md)

制作：[FA Labo](https://fa-labo.com/)

## 利用条件

- **解説文・回路図・部品図（英訳を含む）** は、出典を示して非営利で転載・改変できます。改変版を公開する際は変更した旨を記し、同じ条件で共有してください。[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ja)
- **プログラム** は非営利でローカル利用・改変できます。改変版は、FA Labo・教材名・公式URL・改変した旨を表示し、利用条件を添えて非営利で公開できます。未改変版の再配布・再公開、商用利用には事前の許諾が必要です。[利用条件と出典表示例](LICENSE.txt)

企業向け研修や商用利用については [FA Labo](https://fa-labo.com/) にご相談ください。

## 教材を更新するとき

### Google Search Console

- URLプレフィックスで登録する場合は `https://learn.fa-labo.com/` を指定し、所有権を確認します。
- GitHub Pagesへの公開後、Search Consoleの「サイトマップ」で `sitemap.xml` を送信します。公開URLは `https://learn.fa-labo.com/sitemap.xml` です。
- `robots.txt` からも同じサイトマップを案内しています。トップページと3教材の4つの正規URLを登録し、言語切替・部品表示など同じ教材の表示違いは重複登録しません。
- ページを追加・移動したときは `sitemap.xml` と各ページの正規URL（canonical）を更新します。所有権確認にHTMLタグやファイルを使う場合は、Search Consoleから発行された実際の値を設定してください。

### 開発と動作確認

各教材の動作と図は `apps/` にあります。「部品のしくみ」の単独画面も、リレー盤と同じ図を使います。

- **動作確認**　Node.js と Playwright が必要です。初回は `npm install --no-save --package-lock=false playwright` と `npx playwright install chromium` を実行します。面や部屋を変更したら `node tests/smoke.js` で両教材を確認します。発見ノート、配線判定、部品図、言語切り替えのテストも [tests/](tests/) にあります。
- **英訳の更新**　文章の校正は `tools/english-reviewed.json`、図のラベルと部品の説明は `assets/lesson-terms.js` を編集します。文章を追加・校正したら、[生成スクリプト](tools/build_english.py)冒頭に記載のモデルと依存パッケージを用意し、`python tools/build_english.py <モデルのフォルダ>` で英訳を再生成します。エレベーター固有の校正済み英訳は `assets/elevator-english.js`、動作中の説明は `apps/relay-elevator.html` にあります。
