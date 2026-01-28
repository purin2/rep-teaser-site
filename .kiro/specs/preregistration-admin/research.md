# リサーチログ: preregistration-admin

## サマリー

### 調査範囲
- バックエンド技術選定（BaaS vs カスタムバックエンド）
- データベース設計パターン
- 認証・認可アーキテクチャ
- 静的サイトとの統合方法

### 主要な発見
1. **Supabaseが最適解**: 静的サイト（GitHub Pages）との統合が容易で、PostgreSQL + 認証 + RLS が一体化
2. **RLSによるセキュリティ**: 管理者のみがデータを操作できるようRow Level Securityで保護
3. **サーバーレス構成可能**: Edge Functionsを使えばサーバー不要でAPI実装可能

---

## リサーチログ

### トピック1: バックエンド技術選定

**調査内容**: 静的ティザーサイトに適したバックエンド

**選択肢**:
| 選択肢 | メリット | デメリット |
|--------|---------|-----------|
| Supabase | 即座に使える、認証込み、RLS | ベンダーロックイン |
| NestJS + PostgreSQL | フルコントロール | 開発・運用コスト高 |
| Cloudflare Workers + D1 | 高速、安価 | エコシステム小 |

**決定**: Supabase
**理由**:
- 既存の静的サイト（GitHub Pages）との統合が最も容易
- 認証、DB、RLSがオールインワン
- 管理UI（Supabase Studio）がビルトイン
- 無料枠で十分な規模

**ソース**: [Supabase Best Practices](https://www.leanware.co/insights/supabase-best-practices)

---

### トピック2: Row Level Security設計

**調査内容**: 管理者のみがデータアクセスできるRLS設計

**ベストプラクティス**:
- 全テーブルでRLSを有効化
- ポリシーはシンプルに保つ（複雑なJOINは避ける）
- service_roleキーはサーバーサイドのみで使用
- JWT claimsで認証状態を明示的にチェック

**決定**:
- `registrations`テーブル: 匿名ユーザーはINSERTのみ、管理者はSELECT/UPDATE/DELETE可
- `settings`テーブル: 管理者のみアクセス可
- `audit_logs`テーブル: 管理者のみSELECT可

**ソース**: [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

### トピック3: 管理者認証方式

**調査内容**: シンプルな管理者認証

**選択肢**:
| 方式 | 複雑度 | セキュリティ |
|------|--------|-------------|
| Supabase Auth (Email/Password) | 低 | 高 |
| Magic Link | 低 | 高 |
| カスタムJWT | 高 | 高 |

**決定**: Supabase Auth (Email/Password)
**理由**:
- 管理者は少数（1-2名）なので事前登録で十分
- パスワードリセット機能もビルトイン
- セッション管理が自動

**ソース**: [Supabase Auth Docs](https://supabase.com/docs/guides/auth)

---

## アーキテクチャ評価

### 採用パターン: クライアントサイド + BaaS

```
[ティザーサイト (GitHub Pages)]
          ↓
    [Supabase Client]
          ↓
[Supabase (PostgreSQL + Auth + RLS)]
          ↓
   [管理ダッシュボード]
```

**評価**:
- ✅ サーバー運用不要
- ✅ スケーラブル
- ✅ 低コスト
- ⚠️ Supabaseへの依存

---

## リスクと緩和策

| リスク | 影響度 | 緩和策 |
|--------|--------|--------|
| Supabaseサービス障害 | 中 | 定期バックアップ、障害時は登録停止 |
| anon keyの露出 | 低 | RLSで保護、INSERT権限のみ |
| レート制限 | 低 | 無料枠で十分（50,000リクエスト/日） |

---

*調査日時: 2026-01-28*
