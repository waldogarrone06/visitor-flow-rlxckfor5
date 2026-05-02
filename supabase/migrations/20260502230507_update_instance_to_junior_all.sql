DO $$
BEGIN
  UPDATE public.user_integrations 
  SET 
    whatsapp_instance_id = 'Junior',
    whatsapp_api_url = 'https://4labnutri.online',
    whatsapp_api_token = 'W1A2L3D4O5W1A2L3',
    whatsapp_connected = true;
END $$;
