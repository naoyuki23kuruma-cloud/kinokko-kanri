-- =============================================
-- マルシェ収支管理アプリ Supabase セットアップSQL
-- Supabase の SQL Editor に貼り付けて実行してください
-- =============================================

-- 1. catalysts（催し物）テーブル
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  selling_price integer not null default 0,
  target_quantity integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 仕入れ品目テーブル
create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  item_name text not null,
  quantity integer not null default 0,
  unit_cost integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. updated_at 自動更新トリガー
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger events_updated_at
  before update on events
  for each row execute function update_updated_at();

create or replace trigger purchase_items_updated_at
  before update on purchase_items
  for each row execute function update_updated_at();

-- 4. RLS（Row Level Security）を有効化
--    ※ ログインなし運用の場合は anon ロールに全権限を付与
alter table events enable row level security;
alter table purchase_items enable row level security;

-- anon（ログインなし）での全操作を許可
create policy "allow all for anon on events"
  on events for all
  to anon
  using (true)
  with check (true);

create policy "allow all for anon on purchase_items"
  on purchase_items for all
  to anon
  using (true)
  with check (true);

-- 5. インデックス
create index if not exists purchase_items_event_id_idx
  on purchase_items(event_id);

-- 6. 初期データ投入
do $$
declare
  id1 uuid := gen_random_uuid();
  id2 uuid := gen_random_uuid();
  id3 uuid := gen_random_uuid();
  id4 uuid := gen_random_uuid();
begin
  insert into events (id, name, selling_price, target_quantity, notes) values
    (id1, 'ヨーヨー釣り',           100, 200, '夏祭り定番'),
    (id2, 'スーパーボールすくい',   150, 150, ''),
    (id3, '射的',                   200, 100, '景品要確認'),
    (id4, 'ワークショップ',         500,  50, '材料費確認中');

  insert into purchase_items (event_id, item_name, quantity, unit_cost) values
    -- ヨーヨー釣り
    (id1, 'ヨーヨー風船',    200,   20),
    (id1, '針金フック',      200,    5),
    (id1, '桶・タライ',        2,  800),
    -- スーパーボールすくい
    (id2, 'スーパーボール',  300,   15),
    (id2, 'ポイ',            200,   10),
    -- 射的
    (id3, 'コルク弾',        500,    8),
    (id3, '景品（小）',       80,  150),
    (id3, '景品（大）',       20,  500),
    -- ワークショップ
    (id4, 'クラフト材料セット', 50, 200),
    (id4, '工具・消耗品',      1, 3000);
end $$;
