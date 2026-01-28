# 実装タスク: preregistration-admin

## 概要
設計書に基づいた実装タスクリスト。依存関係を考慮した順序で記載。

---

## タスク1: Supabaseプロジェクトのセットアップ

### 説明
Supabaseプロジェクトを作成し、基本設定を行う。

### 手順
1. [Supabase](https://supabase.com) でアカウント作成/ログイン
2. 新規プロジェクト作成（名前: `rep-teaser`）
3. Project URL と anon key をメモ
4. Authentication > Settings でセッション有効期限を24時間に設定

### 完了条件
- [ ] Supabaseプロジェクトが作成されている
- [ ] Project URL と anon key が取得できている
- [ ] セッション設定が完了している

### 対応要件
3.3

### 依存タスク
なし

---

## タスク2: データベーススキーマの作成

### 説明
registrations, settings, audit_logs テーブルを作成する。

### 手順
Supabase SQL Editorで以下を実行:

```sql
-- registrations テーブル
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_registrations_email ON registrations(email);
CREATE INDEX idx_registrations_created_at ON registrations(created_at);

-- settings テーブル
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO settings (key, value) VALUES ('remaining_count', '1000');

-- audit_logs テーブル
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_value JSONB,
  new_value JSONB,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 完了条件
- [ ] 3つのテーブルが作成されている
- [ ] インデックスが作成されている
- [ ] settings に remaining_count の初期値が入っている

### 対応要件
1.1, 1.4, 2.1, 2.3

### 依存タスク
タスク1

---

## タスク3: Row Level Security ポリシーの設定

### 説明
各テーブルにRLSポリシーを設定する。

### 手順
Supabase SQL Editorで以下を実行:

```sql
-- registrations RLS
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON registrations
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON registrations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- settings RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous select remaining_count" ON settings
  FOR SELECT TO anon
  USING (key = 'remaining_count');

CREATE POLICY "Allow authenticated full access" ON settings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- audit_logs RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated insert" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated select" ON audit_logs
  FOR SELECT TO authenticated
  USING (true);
```

### 完了条件
- [ ] 全テーブルでRLSが有効化されている
- [ ] 匿名ユーザーは registrations への INSERT のみ可能
- [ ] 匿名ユーザーは settings の remaining_count のみ SELECT 可能
- [ ] 認証ユーザーは全操作可能

### 対応要件
3.2, 5.3

### 依存タスク
タスク2

---

## タスク4: 管理者ユーザーの作成

### 説明
Supabase Authで管理者アカウントを作成する。

### 手順
1. Supabase Dashboard > Authentication > Users
2. "Add user" をクリック
3. メールアドレスとパスワードを設定
4. "Auto Confirm User" にチェック

### 完了条件
- [ ] 管理者ユーザーが作成されている
- [ ] ログインできることを確認

### 対応要件
3.1

### 依存タスク
タスク1

---

## タスク5: Supabaseクライアントの実装

### 説明
フロントエンドで使用するSupabaseクライアントを作成する。

### 手順
`js/supabase-client.js` を作成:

```javascript
// Supabase設定
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Supabaseクライアント初期化
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### 完了条件
- [x] js/supabase-client.js が作成されている
- [ ] Supabaseに接続できることを確認

### 対応要件
5.1, 5.2

### 依存タスク
タスク1

---

## タスク6: 事前登録機能の実装

### 説明
ティザーサイトに事前登録機能を実装する。

### 手順
1. `js/registration.js` を作成
2. `index.html` にSupabaseクライアントを読み込み
3. フォーム送信時にSupabaseにデータを保存
4. 残り人数を取得して表示

### 実装内容 (`js/registration.js`):

```javascript
// 残り人数取得
async function getCount() {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'remaining_count')
    .single();

  if (error) throw error;
  return Number(data.value);
}

// 事前登録
async function register(email) {
  const count = await getCount();
  if (count <= 0) {
    return { success: false, error: 'registration_closed' };
  }

  const { data, error } = await supabase
    .from('registrations')
    .insert({ email })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'duplicate_email' };
    }
    throw error;
  }

  return { success: true, id: data.id };
}

// アンケート追加
async function updateQuestionnaire(id, name, company, position) {
  const { error } = await supabase
    .from('registrations')
    .update({ name, company, position, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ページ読み込み時に残り人数を取得
async function initCount() {
  try {
    const count = await getCount();
    updateCount(count);
  } catch (e) {
    console.error('Failed to get count:', e);
  }
}
```

### 完了条件
- [x] 残り人数がDBから取得・表示される
- [x] メールアドレスで事前登録できる
- [x] 重複メールアドレスでエラーが出る
- [x] アンケート情報が保存される

### 対応要件
1.1, 1.2, 1.3, 2.4, 5.1, 5.2, 5.4

### 依存タスク
タスク3, タスク5

---

## タスク7: index.htmlの更新

### 説明
既存のindex.htmlにSupabaseを統合する。

### 手順
1. Supabase JSライブラリを追加
2. js/supabase-client.js を読み込み
3. js/registration.js を読み込み
4. フォーム送信処理をSupabase連携に変更

### 変更箇所:
- `<script>` タグでSupabase CDNを読み込み
- フォーム送信ハンドラを修正
- 初期化時に残り人数を取得

### 完了条件
- [x] ページ読み込み時にDBから残り人数を取得
- [x] フォーム送信でDBにデータが保存される
- [x] エラー時に適切なメッセージが表示される

### 対応要件
1.1, 5.1, 5.2

### 依存タスク
タスク6

---

## タスク8: 管理ダッシュボードの作成

### 説明
管理者用ダッシュボード（admin.html）を作成する。

### 手順
1. `admin.html` を作成
2. ログインフォームを実装
3. ダッシュボード画面を実装
   - 統計表示（残り人数、総登録数、本日登録数）
   - 残り人数編集フォーム
   - 登録者一覧テーブル
   - 検索機能
   - CSVエクスポートボタン

### 完了条件
- [x] admin.html が作成されている
- [x] ログイン/ログアウトが動作する
- [x] 統計が表示される
- [x] 残り人数を変更できる
- [x] 登録者一覧が表示される
- [x] 検索ができる
- [x] CSVエクスポートができる

### 対応要件
3.1, 4.1, 4.2, 4.3, 4.4

### 依存タスク
タスク4, タスク5

---

## タスク9: 管理画面ロジックの実装

### 説明
管理ダッシュボードのJavaScriptロジックを実装する。

### 手順
`js/admin.js` を作成:

```javascript
// 認証チェック
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  return session !== null;
}

// ログイン
async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// ログアウト
async function logout() {
  await supabase.auth.signOut();
  window.location.reload();
}

// ダッシュボード統計取得
async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0];

  const [countRes, totalRes, todayRes] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'remaining_count').single(),
    supabase.from('registrations').select('id', { count: 'exact', head: true }),
    supabase.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', today)
  ]);

  return {
    remaining_count: Number(countRes.data?.value ?? 0),
    total: totalRes.count ?? 0,
    today: todayRes.count ?? 0
  };
}

// 残り人数更新
async function updateRemainingCount(newCount) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: current } = await supabase.from('settings').select('value').eq('key', 'remaining_count').single();

  await supabase.from('settings').update({
    value: newCount.toString(),
    updated_at: new Date().toISOString(),
    updated_by: user?.id
  }).eq('key', 'remaining_count');

  await supabase.from('audit_logs').insert({
    action: 'UPDATE',
    table_name: 'settings',
    record_id: 'remaining_count',
    old_value: { count: current?.value },
    new_value: { count: newCount },
    performed_by: user?.id
  });
}

// 登録者一覧取得
async function getRegistrations(page = 1, limit = 20, query = '') {
  const offset = (page - 1) * limit;
  let q = supabase.from('registrations').select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (query) {
    q = q.or(`email.ilike.%${query}%,name.ilike.%${query}%,company.ilike.%${query}%`);
  }

  return q;
}

// CSVエクスポート
async function exportCSV() {
  const { data } = await supabase.from('registrations').select('*').order('created_at', { ascending: false });
  const headers = ['ID', 'Email', '氏名', '会社名', '役職', '登録日時'];
  const rows = data?.map(r => [r.id, r.email, r.name ?? '', r.company ?? '', r.position ?? '', r.created_at]) ?? [];
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registrations_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}
```

### 完了条件
- [x] 全機能が正常に動作する
- [x] 監査ログが記録される

### 対応要件
2.2, 2.3, 3.1, 4.1, 4.2, 4.3, 4.4

### 依存タスク
タスク8

---

## タスク10: デプロイとテスト

### 説明
変更をGitHub Pagesにデプロイし、動作確認を行う。

### 手順
1. 変更をコミット
2. git push
3. 本番環境で動作確認

### テスト項目
- [ ] 残り人数が正しく表示される
- [ ] 事前登録ができる
- [ ] 重複メールでエラーが出る
- [ ] アンケートが保存される
- [ ] 管理画面にログインできる
- [ ] 残り人数を変更できる
- [ ] 登録者一覧が表示される
- [ ] CSVエクスポートができる
- [ ] 監査ログが記録される

### 完了条件
- [ ] 全テスト項目がパス

### 対応要件
全要件

### 依存タスク
タスク7, タスク9

---

## タスク依存関係図

```
タスク1 (Supabaseセットアップ)
    ├── タスク2 (DBスキーマ)
    │       └── タスク3 (RLS)
    │               └── タスク6 (登録機能)
    │                       └── タスク7 (index.html)
    │                               └── タスク10 (デプロイ)
    ├── タスク4 (管理者ユーザー)
    │       └── タスク8 (admin.html)
    │               └── タスク9 (admin.js)
    │                       └── タスク10 (デプロイ)
    └── タスク5 (Supabaseクライアント)
            ├── タスク6
            └── タスク8
```

---

*生成日時: 2026-01-28*
