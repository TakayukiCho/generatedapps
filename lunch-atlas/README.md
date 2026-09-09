# Lunch Atlas

大井町周辺のランチ候補を、ジャンル・健康・価格・味の条件から探せる静的Webアプリです。

## 主な機能

- ジャンルによる絞り込み
- Healthy / Price / Taste の最低スコアによる絞り込み
- 次の加重スコアによる候補の並び替え

```text
Taste × 0.45 + Healthy × 0.30 + Price × 0.25
```

各スコアは1〜5で、数値が高いほど評価が高いことを表します。

## ローカルで確認する

リポジトリのルートで静的ファイルサーバーを起動します。

```bash
python3 -m http.server 8000
```

ブラウザで <http://localhost:8000/lunch-atlas/> を開いてください。

## 店舗データを更新する

店舗データは次の2ファイルで管理しています。

- `restaurants.json`: 店舗データの原本
- `restaurants-data.js`: ブラウザが読み込む店舗データ

店舗を追加・変更するときは、両方の内容を同期してください。各店舗は次の形式です。

```json
{
  "name": "店舗名",
  "genre": ["和食"],
  "healthy_score": 4,
  "price_score": 3,
  "taste_score": 5
}
```

大井町周辺の新店候補を Google Places API で検出し、更新PRを作成する仕組みについては [`gas/README.md`](./gas/README.md) を参照してください。

## デプロイ

`main` ブランチへのpushを契機に、GitHub ActionsからGitHub Pagesへデプロイされます。
