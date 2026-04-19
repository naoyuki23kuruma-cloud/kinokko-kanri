-- =============================================
-- 追加SQL（既存テーブルへの追加）
-- Supabase の SQL Editor に貼り付けて実行してください
-- =============================================

-- 1. eventsテーブルに実績カラムを追加
alter table events add column if not exists actual_quantity integer;
alter table events add column if not exists actual_sales integer;

-- 2. 出展者テーブルを作成
create table if not exists exhibitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fee_target integer not null default 0,
  fee_actual integer,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. RLSポリシー
alter table exhibitors enable row level security;

create policy "allow all for anon on exhibitors"
  on exhibitors for all
  to anon
  using (true)
  with check (true);

-- 4. updated_atトリガー
create or replace trigger exhibitors_updated_at
  before update on exhibitors
  for each row execute function update_updated_at();

-- 5. サンプルデータ
insert into exhibitors (name, fee_target, fee_actual, notes) values
  ('キッチンカーA', 5000, 5000, 'たこ焼き'),
  ('雑貨ショップB', 3000, null, 'アクセサリー'),
  ('ワークショップC', 4000, null, 'クラフト体験');
