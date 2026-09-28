-- Public storage bucket for product/category/banner/logo images, with admin-only writes.

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do update set public = true;

drop policy if exists public_read_images on storage.objects;
create policy public_read_images on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'images');

drop policy if exists admin_insert_images on storage.objects;
create policy admin_insert_images on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images' and public.is_admin());

drop policy if exists admin_update_images on storage.objects;
create policy admin_update_images on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and public.is_admin())
  with check (bucket_id = 'images' and public.is_admin());

drop policy if exists admin_delete_images on storage.objects;
create policy admin_delete_images on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and public.is_admin());
