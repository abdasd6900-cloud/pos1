/*
# Add sender_name column to sms_inbox_events

## Purpose
WhatsApp notifications include the sender's contact name (not just phone number).
Adding a `sender_name` column lets the WhatsApp listener pass the contact name
through to the web dashboard so it can display "أحمد محمد" instead of just a phone number.

## Changes
- Add `sender_name` (text, nullable) to `sms_inbox_events`
*/

ALTER TABLE public.sms_inbox_events ADD COLUMN IF NOT EXISTS sender_name text;
