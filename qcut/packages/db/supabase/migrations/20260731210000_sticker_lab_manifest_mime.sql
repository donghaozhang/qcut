-- The private reference manifest (jianying/<date>/manifest.json) lives in the
-- same bucket as the artwork it describes, so the bucket must accept JSON in
-- addition to the two image formats.
update storage.buckets
set allowed_mime_types = array['image/gif', 'image/png', 'application/json']
where id = 'sticker-lab';
