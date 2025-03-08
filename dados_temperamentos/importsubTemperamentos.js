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
                            `INSERT INTO subtemperamentos 
                            (subtemperamento, descricao, subtemperamento_en, descricao_en)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (subtemperamento) DO UPDATE
                            SET descricao = EXCLUDED.descricao,
                                subtemperamento_en = EXCLUDED.subtemperamento_en,
                                descricao_en = EXCLUDED.descricao_en;`,
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
        await importarCSV("subtemperamentos_unico.csv", [
            "Subtemperamento", "Descricao", "Subtemperamento_en", "Descricao_en"
        ]);
    } catch (error) {
        console.error("🚨 Erro na importação do arquivo CSV:", error);
    } finally {
        pool.end();
    }
})();
