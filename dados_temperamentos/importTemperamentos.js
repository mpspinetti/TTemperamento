require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");
const csv = require("csv-parser");

// Configuração do PostgreSQL
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "TTemperamento",
    password: "teste",
    port: 5432,
});

// Função para validar se todos os campos estão preenchidos
function validarDados(row, colunas) {
    return colunas.every((col) => row[col] && row[col].trim() !== "");
}

// Função para importar os dados do CSV único
async function importarCSV(caminhoCSV, colunas) {
    return new Promise((resolve, reject) => {
        const resultados = [];

        fs.createReadStream(caminhoCSV, { encoding: "utf-8" })
            .pipe(csv({ separator: ";", headers: colunas }))
            .on("data", (data) => {
                if (validarDados(data, colunas)) {
                    resultados.push(data);
                } else {
                    console.warn(`⚠️ Linha ignorada (dados incompletos) no arquivo ${caminhoCSV}:`, data);
                }
            })
            .on("end", async () => {
                console.log(`📌 Importando ${resultados.length} registros de ${caminhoCSV}...`);

                try {
                    for (const row of resultados) {
                        const valores = colunas.map((col) => row[col] || null);

                        await pool.query(
                            `INSERT INTO temperamentos 
                            (temperamento, descricao, comportamento, positivo, atencao, desafio, sugestao,
                            temperamento_en, descricao_en, comportamento_en, positivo_en, atencao_en, desafio_en, sugestao_en)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                            ON CONFLICT (temperamento) DO UPDATE
                            SET descricao = EXCLUDED.descricao,
                                comportamento = EXCLUDED.comportamento,
                                positivo = EXCLUDED.positivo,
                                atencao = EXCLUDED.atencao,
                                desafio = EXCLUDED.desafio,
                                sugestao = EXCLUDED.sugestao,
                                temperamento_en = EXCLUDED.temperamento_en,
                                descricao_en = EXCLUDED.descricao_en,
                                comportamento_en = EXCLUDED.comportamento_en,
                                positivo_en = EXCLUDED.positivo_en,
                                atencao_en = EXCLUDED.atencao_en,
                                desafio_en = EXCLUDED.desafio_en,
                                sugestao_en = EXCLUDED.sugestao_en;`,
                            valores
                        );
                    }

                    console.log(`✅ Importação concluída para ${caminhoCSV}!`);
                    resolve();
                } catch (error) {
                    console.error(`❌ Erro ao importar ${caminhoCSV}:`, error);
                    reject(error);
                }
            })
            .on("error", (error) => {
                console.error(`❌ Erro ao ler o arquivo ${caminhoCSV}:`, error);
                reject(error);
            });
    });
}

// Executar a importação
(async () => {
    try {
        await importarCSV("temperamentos_unico.csv", [
            "Temperamento", "Descricao", "Comportamento", "Positivo", "Atencao", "Desafio", "Sugestao",
            "Temperamento_en", "Descricao_en", "Comportamento_en", "Positivo_en", "Atencao_en", "Desafio_en", "Sugestao_en"
        ]);
    } catch (error) {
        console.error("🚨 Erro na importação do arquivo CSV:", error);
    } finally {
        pool.end();
    }
})();
