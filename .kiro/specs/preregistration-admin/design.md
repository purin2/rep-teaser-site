# 技術設計書: preregistration-admin

## 概要

事前登録ユーザー情報を保管し、管理者が残り人数を操作できるシステムの技術設計。

---

## アーキテクチャパターン & 境界マップ

### システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        クライアント層                            │
├──────────────────────────┬──────────────────────────────────────┤
│   ティザーサイト          │        管理ダッシュボード              │
│   (GitHub Pages)         │        (admin.html)                  │
│   - 事前登録フォーム      │        - ログイン認証                 │
│   - 残り人数表示          │        - 登録者一覧                   │
└──────────┬───────────────┴──────────────┬───────────────────────┘
           │                              │
           │ Supabase JS Client           │ Supabase JS Client
           │ (anon key)                   │ (authenticated)
           ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Auth     │  │  Database   │  │    Row Level Security   │ │
│  │  (認証)     │  │ (PostgreSQL)│  │    (アクセス制御)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 境界定義

| 境界 | 説明 | 通信方式 |
|------|------|----------|
| ティザーサイト ↔ Supabase | 事前登録、残り人数取得 | HTTPS (anon key) |
| 管理画面 ↔ Supabase | CRUD操作、認証 | HTTPS (authenticated) |
| Supabase内部 | DB ↔ Auth ↔ RLS | 内部 |

---

## 技術スタック & 整合性

### 採用技術

| レイヤー | 技術 | バージョン | 理由 |
|----------|------|-----------|------|
| データベース | PostgreSQL (Supabase) | 15+ | マネージド、RLS対応 |
| 認証 | Supabase Auth | - | ビルトイン、Email/Password |
| フロントエンド | Vanilla JS + Supabase Client | @supabase/supabase-js v2 | 既存サイトと統合容易 |
| ホスティング | GitHub Pages | - | 既存インフラ活用 |

### 外部依存

```json
{
  "@supabase/supabase-js": "^2.x"
}
```

---

## コンポーネント & インターフェース契約

### 1. データベーススキーマ

#### registrations テーブル
**対応要件**: 1.1, 1.2, 1.3, 1.4

```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_registrations_email ON registrations(email);
CREATE INDEX idx_registrations_created_at ON registrations(created_at);
```

#### settings テーブル
**対応要件**: 2.1, 2.2

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 初期データ
INSERT INTO settings (key, value) VALUES ('remaining_count', '1000');
```

#### audit_logs テーブル
**対応要件**: 2.3

```sql
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

### 2. Row Level Security ポリシー

#### registrations テーブル
**対応要件**: 3.2, 5.3

```sql
-- RLS有効化
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザー: INSERTのみ可能
CREATE POLICY "Allow anonymous insert" ON registrations
  FOR INSERT TO anon
  WITH CHECK (true);

-- 認証済みユーザー（管理者）: 全操作可能
CREATE POLICY "Allow authenticated full access" ON registrations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

#### settings テーブル
**対応要件**: 3.2

```sql
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザー: SELECTのみ（残り人数取得用）
CREATE POLICY "Allow anonymous select" ON settings
  FOR SELECT TO anon
  USING (key = 'remaining_count');

-- 認証済みユーザー: 全操作可能
CREATE POLICY "Allow authenticated full access" ON settings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

### 3. API インターフェース

Supabaseクライアントを使用したAPI呼び出し。

#### 残り人数取得
**対応要件**: 5.1

```typescript
interface CountResponse {
  remaining_count: number;
}

// GET: 残り人数
async function getCount(): Promise<CountResponse> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'remaining_count')
    .single();

  if (error) throw error;
  return { remaining_count: Number(data.value) };
}
```

#### 事前登録
**対応要件**: 5.2, 5.4, 1.3

```typescript
interface RegisterRequest {
  email: string;
}

interface RegisterResponse {
  success: boolean;
  id?: string;
  error?: string;
}

async function register(email: string): Promise<RegisterResponse> {
  // 残り人数チェック
  const count = await getCount();
  if (count.remaining_count <= 0) {
    return { success: false, error: 'registration_closed' };
  }

  // 登録
  const { data, error } = await supabase
    .from('registrations')
    .insert({ email })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') { // unique violation
      return { success: false, error: 'duplicate_email' };
    }
    throw error;
  }

  return { success: true, id: data.id };
}
```

#### アンケート追加
**対応要件**: 1.2

```typescript
interface QuestionnaireRequest {
  id: string;
  name?: string;
  company?: string;
  position?: string;
}

async function updateQuestionnaire(req: QuestionnaireRequest): Promise<void> {
  const { error } = await supabase
    .from('registrations')
    .update({
      name: req.name,
      company: req.company,
      position: req.position,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.id);

  if (error) throw error;
}
```

### 4. 管理ダッシュボード コンポーネント

#### 認証コンポーネント
**対応要件**: 3.1, 3.3

```typescript
// ログイン
async function login(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
}

// ログアウト
async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

// セッションチェック
async function checkSession(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return session !== null;
}
```

#### ダッシュボードデータ取得
**対応要件**: 4.1

```typescript
interface DashboardStats {
  remaining_count: number;
  total_registrations: number;
  today_registrations: number;
}

async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0];

  const [countResult, totalResult, todayResult] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'remaining_count').single(),
    supabase.from('registrations').select('id', { count: 'exact', head: true }),
    supabase.from('registrations').select('id', { count: 'exact', head: true })
      .gte('created_at', today)
  ]);

  return {
    remaining_count: Number(countResult.data?.value ?? 0),
    total_registrations: totalResult.count ?? 0,
    today_registrations: todayResult.count ?? 0
  };
}
```

#### 残り人数更新
**対応要件**: 4.2, 2.3

```typescript
async function updateRemainingCount(newCount: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  // 現在の値を取得（監査ログ用）
  const { data: current } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'remaining_count')
    .single();

  // 更新
  await supabase
    .from('settings')
    .update({
      value: newCount.toString(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id
    })
    .eq('key', 'remaining_count');

  // 監査ログ
  await supabase.from('audit_logs').insert({
    action: 'UPDATE',
    table_name: 'settings',
    record_id: 'remaining_count',
    old_value: { count: current?.value },
    new_value: { count: newCount },
    performed_by: user?.id
  });
}
```

#### CSVエクスポート
**対応要件**: 4.3

```typescript
async function exportToCSV(): Promise<string> {
  const { data } = await supabase
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });

  const headers = ['ID', 'Email', '氏名', '会社名', '役職', '登録日時'];
  const rows = data?.map(r => [
    r.id,
    r.email,
    r.name ?? '',
    r.company ?? '',
    r.position ?? '',
    r.created_at
  ]) ?? [];

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}
```

#### 検索
**対応要件**: 4.4

```typescript
interface SearchParams {
  query?: string;
  page?: number;
  limit?: number;
}

async function searchRegistrations(params: SearchParams) {
  const { query, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  let queryBuilder = supabase
    .from('registrations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (query) {
    queryBuilder = queryBuilder.or(
      `email.ilike.%${query}%,name.ilike.%${query}%,company.ilike.%${query}%`
    );
  }

  return queryBuilder;
}
```

---

## ファイル構成

```
rep-teaser-site/
├── index.html              # 既存ティザーサイト（変更）
├── admin.html              # 管理ダッシュボード（新規）
├── js/
│   ├── supabase-client.js  # Supabase初期化（新規）
│   ├── registration.js     # 事前登録ロジック（新規）
│   └── admin.js            # 管理画面ロジック（新規）
└── .kiro/
    └── specs/
        └── preregistration-admin/
            ├── spec.json
            ├── requirements.md
            ├── design.md
            └── research.md
```

---

## セキュリティ考慮事項

### CORS設定
**対応要件**: 5.3

Supabaseダッシュボードで許可オリジンを設定:
- `https://purin2.github.io`
- `http://localhost:*`（開発用）

### キー管理
- `anon key`: フロントエンドで使用可（RLSで保護）
- `service_role key`: 使用しない（全てRLSで制御）

### 入力バリデーション
- メールアドレス: フロントエンド + DB制約で検証
- 数値入力: 範囲チェック（0以上）

---

## 要件トレーサビリティマトリクス

| 要件ID | コンポーネント | 実装方法 |
|--------|---------------|----------|
| 1.1 | registrations テーブル, register() | INSERT with email |
| 1.2 | registrations テーブル, updateQuestionnaire() | UPDATE with id |
| 1.3 | registrations テーブル | UNIQUE制約 + エラーハンドリング |
| 1.4 | registrations テーブル | UUID DEFAULT gen_random_uuid() |
| 2.1 | settings テーブル | key-value形式で管理 |
| 2.2 | getCount(), Supabase Realtime | 即時反映 |
| 2.3 | audit_logs テーブル | 変更時に自動記録 |
| 2.4 | register() | 残り人数チェック |
| 3.1 | login(), Supabase Auth | signInWithPassword |
| 3.2 | RLS ポリシー | authenticated role |
| 3.3 | Supabase Auth | セッション設定（24時間） |
| 4.1 | getDashboardStats() | 集計クエリ |
| 4.2 | updateRemainingCount() | UPDATE + audit log |
| 4.3 | exportToCSV() | CSV生成 + ダウンロード |
| 4.4 | searchRegistrations() | ilike検索 |
| 5.1 | getCount() | settings SELECT |
| 5.2 | register() | registrations INSERT |
| 5.3 | Supabase CORS設定 | 許可オリジン |
| 5.4 | register() | 残り人数0チェック |

---

*設計日時: 2026-01-28*
*ステータス: レビュー待ち*
