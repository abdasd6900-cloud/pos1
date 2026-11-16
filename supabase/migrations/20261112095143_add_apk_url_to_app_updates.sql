-- Add apk_url column for Android APK download link
ALTER TABLE app_updates ADD COLUMN IF NOT EXISTS apk_url text DEFAULT '';

-- Add force_install column to require installation (can't be dismissed)
ALTER TABLE app_updates ADD COLUMN IF NOT EXISTS force_install boolean NOT NULL DEFAULT false;
