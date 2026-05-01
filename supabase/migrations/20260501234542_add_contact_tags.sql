CREATE TABLE IF NOT EXISTS public.contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS public.contact_tag_relations (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tag_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own tags" ON public.contact_tags;
CREATE POLICY "Users manage own tags" ON public.contact_tags
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own tag relations" ON public.contact_tag_relations;
CREATE POLICY "Users manage own tag relations" ON public.contact_tag_relations
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.contacts WHERE contacts.id = contact_tag_relations.contact_id AND contacts.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contacts WHERE contacts.id = contact_tag_relations.contact_id AND contacts.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_contact_tag_relations_contact_id ON public.contact_tag_relations(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_relations_tag_id ON public.contact_tag_relations(tag_id);
