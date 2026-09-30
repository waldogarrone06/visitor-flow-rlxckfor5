-- Allow logistics and kit_manager users to delete appointments if needed from shipments management
DROP POLICY IF EXISTS "logistics_appointments_delete" ON public.appointments;
CREATE POLICY "logistics_appointments_delete" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('logistics', 'kit_manager')
    )
  );
