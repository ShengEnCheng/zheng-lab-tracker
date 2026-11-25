-- 002：修復 lab_backups.kind 約束漂移
--
-- 症狀：每週日（台北時間）的排程備份一直失敗，但沒有任何人收到通知。
--   api/backup.js 在週日會呼叫 create_lab_backup(p_kind => 'weekly')，
--   資料庫回：
--     new row for relation "lab_backups" violates check constraint "lab_backups_kind_check"
--   lab_backup_runs 只留下每週一筆 status = 'failed'。
--
-- 原因：線上 lab_backups 的 check 約束只接受
--   ('scheduled', 'before_import', 'before_restore', 'migration')
-- 少了 'weekly'。而 001 用的是 create table if not exists，對「已經存在」的表
-- 不會重新套用約束，所以最早用舊定義建出來的表就一直停在舊約束上，
-- repo 裡的 SQL 看起來卻完全正確。這是典型的 schema 漂移。
--
-- 這個 migration 可以重複執行：
--   1. 若 lab_backups 不存在就跳過（請先跑 001）
--   2. 找出該表上所有「kind 列舉」性質的 check 約束並刪掉（不寫死約束名稱）
--   3. 重新建立唯一一份正確的定義，其中包含 'weekly'

do $$
declare
  constraint_row record;
begin
  if to_regclass('public.lab_backups') is null then
    raise notice 'public.lab_backups 不存在，略過修復。請先執行 001_lab_state.sql。';
    return;
  end if;

  -- 只挑「kind 列舉」那一條，避免誤刪其他與 kind 相關的業務約束
  for constraint_row in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.lab_backups'::regclass
      and con.contype = 'c'
      and (
        con.conname ilike '%kind%'
        or pg_get_constraintdef(con.oid) ilike '%before_import%'
      )
  loop
    execute format('alter table public.lab_backups drop constraint %I', constraint_row.conname::text);
  end loop;

  alter table public.lab_backups
    add constraint lab_backups_kind_check
    check (kind in ('scheduled', 'weekly', 'before_import', 'before_restore', 'migration'));

  raise notice 'lab_backups.kind 約束已修復：現在接受 scheduled/weekly/before_import/before_restore/migration。';
end $$;
