// Configuração do Painel da Vida.
// O endereço e a chave "anon" do Supabase são públicos por natureza: ficam no
// navegador de qualquer app que usa Supabase. Quem protege os dados são as
// regras de acesso (RLS) do banco, que só deixam cada pessoa ver o que é dela.
// NUNCA coloque aqui a chave "service_role" ou a senha do banco.
window.PAINEL_CONFIG = {
  url: 'https://lpnzcxxxywaknghxcpah.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwbnpjeHh4eXdha25naHhjcGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDMzMTQsImV4cCI6MjEwODc3OTMxNH0.9Nudntqbrs-Dp7yFuUp-_o9rvW9eLvUrbwZMFVU7-0w',
  // Mude para true depois de ativar o login com Google no Supabase
  // (Authentication > Sign In / Providers > Google).
  google: false
};
