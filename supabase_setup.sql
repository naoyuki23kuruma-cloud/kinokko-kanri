-- =============================================
-- マルシェ収支管理 Supabase 完全セットアップSQL（全部入り）
-- Supabase SQL Editor に貼り付けて「Run」してください
-- =============================================

-- 1. eventsテーブル
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  selling_price integer not null default 0,
  target_quantity integer not null default 0,
  actual_quantity integer,
  actual_sales integer,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table events add column if not exists actual_quantity integer;
alter table events add column if not exists actual_sales integer;

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

-- 3. 出展者テーブル
create table if not exists exhibitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fee_target integer not null default 0,
  fee_actual integer,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. updated_at自動更新
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create or replace trigger events_updated_at before update on events for each row execute function update_updated_at();
create or replace trigger purchase_items_updated_at before update on purchase_items for each row execute function update_updated_at();
create or replace trigger exhibitors_updated_at before update on exhibitors for each row execute function update_updated_at();

-- 5. RLS
alter table events enable row level security;
alter table purchase_items enable row level security;
alter table exhibitors enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='events' and policyname='allow all for anon on events') then
    execute 'create policy "allow all for anon on events" on events for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='purchase_items' and policyname='allow all for anon on purchase_items') then
    execute 'create policy "allow all for anon on purchase_items" on purchase_items for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='exhibitors' and policyname='allow all for anon on exhibitors') then
    execute 'create policy "allow all for anon on exhibitors" on exhibitors for all to anon using (true) with check (true)';
  end if;
end $$;

create index if not exists purchase_items_event_id_idx on purchase_items(event_id);

-- 6. 初期データ（空の場合のみ）
do $$
declare
  cnt integer;
  id1 uuid := gen_random_uuid();
  id2 uuid := gen_random_uuid();
  id3 uuid := gen_random_uuid();
  id4 uuid := gen_random_uuid();
begin
  select count(*) into cnt from events;
  if cnt = 0 then
    insert into events (id, name, selling_price, target_quantity, notes) values
      (id1, 'ヨーヨー釣り', 100, 200, '夏祭り定番'),
      (id2, 'スーパーボールすくい', 150, 150, ''),
      (id3, '射的', 200, 100, '景品要確認'),
      (id4, 'ワークショップ', 500, 50, '材料費確認中');
    insert into purchase_items (event_id, item_name, quantity, unit_cost) values
      (id1, 'ヨーヨー風船', 200, 20),(id1, '針金フック', 200, 5),(id1, '桶・タライ', 2, 800),
      (id2, 'スーパーボール', 300, 15),(id2, 'ポイ', 200, 10),
      (id3, 'コルク弾', 500, 8),(id3, '景品（小）', 80, 150),(id3, '景品（大）', 20, 500),
      (id4, 'クラフト材料セット', 50, 200),(id4, '工具・消耗品', 1, 3000);
  end if;
  select count(*) into cnt from exhibitors;
  if cnt = 0 then
    insert into exhibitors (name, fee_target, notes) values
      ('キッチンカーA', 5000, 'たこ焼き'),
      ('雑貨ショップB', 3000, 'アクセサリー'),
      ('ワークショップC', 4000, 'クラフト体験');
  end if;
end $$;
