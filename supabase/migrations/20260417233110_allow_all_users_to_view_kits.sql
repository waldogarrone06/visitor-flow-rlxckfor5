-- Drop existing select policies if they exist to make sure we have a clean permissive read
DROP POLICY IF EXISTS "Anyone can view kits" ON public.kits;
CREATE POLICY "Anyone can view kits" ON public.kits
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view kit items" ON public.kit_items;
CREATE POLICY "Anyone can view kit items" ON public.kit_items
  FOR SELECT TO authenticated USING (true);
