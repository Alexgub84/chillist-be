ALTER TABLE plans ADD COLUMN whatsapp_group_id varchar(128);
CREATE UNIQUE INDEX plans_whatsapp_group_id_unique ON plans (whatsapp_group_id)
  WHERE whatsapp_group_id IS NOT NULL;
