# マルシェ収支管理アプリ セットアップ手順

**所要時間：約30〜40分（初回）**

---

## ① GitHubにコードをアップロードする

### 1-1. GitHubアカウントを作る（持っていない場合）
1. https://github.com にアクセス
2. 「Sign up」からアカウント作成（無料）

### 1-2. 新しいリポジトリを作る
1. GitHubにログイン
2. 右上「＋」→「New repository」
3. Repository name: `marche-app`
4. Public または Private を選ぶ（どちらでも可）
5. 「Create repository」をクリック

### 1-3. コードをアップロードする

**方法A：GitHub Desktop を使う場合（初心者向け）**
1. https://desktop.github.com/ からインストール
2. 「Add an Existing Repository」→ marche-appフォルダを選択
3. 「Publish repository」でGitHubにアップロード

**方法B：コマンドラインの場合**
```bash
cd marche-app
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/marche-app.git
git push -u origin main
```

---

## ② Supabase の設定

### 2-1. Supabaseアカウント作成
1. https://supabase.com にアクセス
2. 「Start your project」→ GitHubアカウントでログイン（推奨）

### 2-2. プロジェクト作成
1. 「New project」をクリック
2. 以下を入力：
   - **Name**: `marche-app`（任意）
   - **Database Password**: 強いパスワードを設定（メモしておく）
   - **Region**: `Northeast Asia (Tokyo)` を選択
3. 「Create new project」→ 約2分待つ

### 2-3. データベースのテーブルを作成
1. 左メニュー「SQL Editor」をクリック
2. 「New query」をクリック
3. プロジェクト内の **`supabase_setup.sql`** の内容を全てコピー&ペースト
4. 「Run」（または Ctrl+Enter）をクリック
5. 「Success」と表示されればOK

### 2-4. 接続キーを取得する
1. 左メニュー「Project Settings」（歯車アイコン）
2. 「API」をクリック
3. 以下の2つをコピーしてメモ帳に保存：
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` で始まる長い文字列

---

## ③ Vercel にデプロイする

### 3-1. Vercelアカウント作成
1. https://vercel.com にアクセス
2. 「Sign Up」→「Continue with GitHub」でログイン

### 3-2. プロジェクトをインポート
1. 「Add New...」→「Project」
2. GitHubのリポジトリ一覧から「marche-app」を選択
3. 「Import」をクリック

### 3-3. 環境変数を設定する（重要！）
「Configure Project」の画面で：
1. 「Environment Variables」を展開
2. 以下の2つを追加：

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabaseで取得したProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseで取得したanon public key |

3. 各行「Add」ボタンをクリック

### 3-4. デプロイ実行
1. 「Deploy」をクリック
2. 約1〜2分でデプロイ完了
3. `https://marche-app-xxxx.vercel.app` のようなURLが発行される

---

## ④ スマホで共有する

1. 発行されたVercelのURLをコピー
2. LINEやメッセージで送信
3. 受け取った人がURLを開くだけで使える

> **全員が同じSupabaseのデータを共有するため、誰かが追加した催し物は全員に反映されます。**

---

## ⑤ ローカルで動かす場合（確認用）

### 5-1. Node.jsをインストール
https://nodejs.org から LTS版をダウンロード・インストール

### 5-2. 環境変数ファイルを作成
```bash
# .env.local.example をコピー
cp .env.local.example .env.local
```
`.env.local` をテキストエディタで開き、Supabaseの値を入力：
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 5-3. 起動
```bash
npm install
npm run dev
```
ブラウザで http://localhost:3000 を開く

---

## よくある質問

**Q: データはどこに保存されますか？**
Supabaseのデータベースに保存されます。インターネット上にあるため、URLを共有した全員が同じデータを見られます。

**Q: 無料で使えますか？**
Supabase・Vercelともに小規模利用は無料です。
- Supabase: 月500MB・50,000リクエストまで無料
- Vercel: 月100GBまで無料

**Q: セキュリティは大丈夫ですか？**
現在はログインなしで誰でも編集できる設定です。社内限定で使う場合はこれで十分ですが、外部に公開したくない場合はVercelの「Password Protection」機能（有料）またはSupabaseのRLSによる認証追加を検討してください。

**Q: データのバックアップはできますか？**
アプリの「CSV出力」ボタンからいつでもダウンロードできます。
Supabaseのダッシュボードからもデータのエクスポートが可能です。

---

## ファイル構成

```
marche-app/
├── app/
│   ├── layout.tsx        # ルートレイアウト
│   ├── page.tsx          # トップページ
│   └── globals.css       # グローバルCSS
├── components/
│   └── MarcheApp.tsx     # メインアプリ（全機能）
├── lib/
│   ├── supabase.ts       # Supabase接続
│   ├── types.ts          # 型定義
│   └── calc.ts           # 収支計算ロジック
├── supabase_setup.sql    # DBセットアップSQL
├── .env.local.example    # 環境変数サンプル
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```
