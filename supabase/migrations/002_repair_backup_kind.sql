-- 002：修復 lab_backups.kind 約束漂移
--
-- 問題：線上資料庫的 lab_backups_kind_check 只接受
--   ('scheduled', 'before_import', 'before_restore', 'migration')
-- 少了 'weekly'。但 api/backup.js 在台北時間週日會傳 p_kind = 'weekly'，
-- 於是每週日排程備份都在 insert 時失敗：
--   new row for relation "lab_backups" violates check constraint "lab_backups_kind_check"
--
-- 後果：週日那一份備份根本沒產生，lab_backup_runs 只留下一筆 failed；
-- prune_lab_backups 的 weekly 保留策略也形同無效（永遠沒有 weekly 備份可保留）。
--
-- 為什麼會漂移：001 用的是 create table if not exists，對已存在的表不會
-- 重新套用約束，所以當初用更舊的 SQL 建出來的表就一直停在舊定義。
--
-- 這個 migration 可以重複執行：先找出 lab_backups 上所有提到 kind 的 check
-- 約束並刪掉（不依賴約束名稱），再建立唯一一份正確的定義。

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'lab_backups'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.lab_backups drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.lab_backups
  add constraint lab_backups_kind_check
  check (kind in ('scheduled', 'weekly', 'before_import', 'before_restore', 'migration'));

-- 讓 001 重新執行時也能自我修復，而不是只靠 002。
-- （001 已改為在 create table if not exists 之後補上同樣的 drop/add。）
