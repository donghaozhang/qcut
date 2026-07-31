insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'sticker-lab',
  'sticker-lab',
  false,
  26214400,
  array['image/gif', 'image/png']
);
