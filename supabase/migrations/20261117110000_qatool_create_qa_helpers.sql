-- [QA E2E] Conteúdo removido em segurança (v0.0.428): esta migration criava ferramentas
-- de teste que faziam reservas HTTP reais contra produção se aplicada em banco novo.
-- Mantida como no-op para preservar o histórico de versões. A limpeza das functions
-- qa_* e da tabela qa_test_log é feita pela migration drop_qa_artifacts.
SELECT 1;
