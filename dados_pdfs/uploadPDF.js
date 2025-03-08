require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");

// Configuração do PostgreSQL
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "TTemperamento",
    password: "teste",
    port: 5432,
});

// Função para armazenar os templates no banco de dados
async function uploadPDFTemplate(nomeTemplate, caminhoArquivo) {
    try {
        const pdfBuffer = fs.readFileSync(caminhoArquivo);

        await pool.query(
            `INSERT INTO pdf_templates (name, file)
            VALUES ($1, $2)
            ON CONFLICT (name) DO UPDATE SET file = EXCLUDED.file;`,
            [nomeTemplate, pdfBuffer]
        );

        console.log(`✅ Template ${nomeTemplate} armazenado com sucesso!`);
    } catch (error) {
        console.error(`❌ Erro ao armazenar o template ${nomeTemplate}:`, error);
    }
}

// Executar upload dos templates
(async () => {
    await uploadPDFTemplate("template_pt", "template_pt.pdf");
    await uploadPDFTemplate("template_en", "template_en.pdf");
    pool.end();
})();
