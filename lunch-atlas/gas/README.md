# 大井町 新店ウォッチャー (Google Apps Script)

大井町駅周辺の飲食店を Google Places API (New) で定期チェックし、新しく検出した店舗があれば `lunch-atlas/restaurants.json` と `restaurants-data.js` を更新する GitHub PR を自動作成します。

## 動作

1. 大井町駅周辺を5つの重なる検索円に分割して Nearby Search を実行
2. Google Place ID を Script Properties に保存
3. 初回実行は現在の店舗をベースライン登録するだけで終了
4. 2回目以降、未登録の Place ID を新店候補として検出
5. Lunch Atlas に同名店がなければデータを追加したブランチを作成
6. GitHub REST API で PR を作成
7. PR作成に成功した店舗のみ `seen` として保存

Google Places の検索順位変動で既存店が後から検索結果に現れる可能性があるため、PRは「新店候補」として作成します。マージ前に内容を確認してください。

## 必要な Script Properties

Apps Script の **プロジェクトの設定 → スクリプト プロパティ** に以下を設定します。

| Key | Value |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Places API (New) を有効化した Google Maps Platform API key |
| `GITHUB_TOKEN` | `TakayukiCho/generatedapps` に Contents: Read/Write と Pull requests: Read/Write を持つ fine-grained PAT |

トークンやAPIキーはコードに直接書かないでください。

## セットアップ

1. Apps Script プロジェクトを新規作成
2. `Code.gs` と `appsscript.json` をコピー
3. Script Properties を設定
4. `watchNewRestaurants()` を手動実行
   - 初回はベースライン作成のみで、PRは作成されません
5. `setupDailyTrigger()` を一度実行
   - 毎日8時台に `watchNewRestaurants()` が実行されます

## APIコスト方針

Nearby Search は5地点 × 1日1回 = 約150リクエスト/月です。

取得フィールドは Nearby Search Pro に収まるものだけにしています。`rating`, `priceLevel`, `servesLunch` などは上位SKUを発火させるため取得していません。

Lunch Atlas の `healthy_score`, `price_score`, `taste_score` は `primaryType` に応じた暫定値を入れ、PRレビューで必要に応じて調整します。

## 監視範囲

中心は大井町駅（約 `35.60699, 139.73505`）。駅を中心に東西南北へ検索点をずらし、それぞれ半径420mで取得します。

検索対象タイプ:

- restaurant
- cafe
- bakery
- bar
- meal_takeaway

`includeFutureOpeningBusinesses: true` を指定しているため、Google Places に登録済みの開店予定店舗も対象になります。

## 手動リセット

ベースラインを作り直したい場合は Apps Script の Script Properties から次を削除します。

- `BASELINE_INITIALIZED`
- `seen:*`

次回の `watchNewRestaurants()` が再びベースライン作成になります。
