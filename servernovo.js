require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "10mb", type: "application/json", charset: "utf-8" }));
app.use(express.urlencoded({ extended: true }));

// Configuração do PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    application_name: "TTemperamento",
    client_encoding: "UTF8"

});

// Teste de conexão com o banco de dados
pool.connect((err, client, release) => {
    if (err) {
        console.error("❌ Erro ao conectar ao PostgreSQL:", err.stack);
    } else {
        console.log("✅ Conexão com PostgreSQL estabelecida com sucesso!");
    }
    release();
});

// Função de Cálculo do Temperamento e Subtemperamento
function calcularPontuacao(respostas) {
    let contagemTemperatura = { Quente: 0, Frio: 0 };
    let contagemUmidade = { Úmido: 0, Seco: 0 };

    let contagemSubtemperamentos = {
        "Faisca": 0, "Fogo": 0, "Brasa": 0,  
        "Pedra": 0, "Terra": 0, "Argila": 0,  
        "Gelo": 0, "Água": 0, "Vapor": 0,  
        "Brisa": 0, "Ar": 0, "Vento": 0  
    };

    respostas.slice(0, 11).forEach((resposta) => {
        if (resposta === "A") contagemTemperatura.Quente++;
        if (resposta === "B") contagemTemperatura.Frio++;
    });

    respostas.slice(11, 22).forEach((resposta) => {
        if (resposta === "A") contagemUmidade.Úmido++;
        if (resposta === "B") contagemUmidade.Seco++;
    });

    let temperaturaFinal = contagemTemperatura.Quente >= contagemTemperatura.Frio ? "Quente" : "Frio";
    let umidadeFinal = contagemUmidade.Úmido >= contagemUmidade.Seco ? "Úmido" : "Seco";

    let temperamentoFinal = "Desconhecido";
    if (temperaturaFinal === "Quente" && umidadeFinal === "Úmido") temperamentoFinal = "Sanguíneo";
    if (temperaturaFinal === "Quente" && umidadeFinal === "Seco") temperamentoFinal = "Colérico";
    if (temperaturaFinal === "Frio" && umidadeFinal === "Seco") temperamentoFinal = "Melancólico";
    if (temperaturaFinal === "Frio" && umidadeFinal === "Úmido") temperamentoFinal = "Fleumático";

    respostas.slice(22, 42).forEach((resposta) => {
        if (contagemSubtemperamentos[resposta] !== undefined) {
            contagemSubtemperamentos[resposta]++;
        }
    });

    let subtemperamentoFinal = Object.keys(contagemSubtemperamentos).reduce((a, b) => 
        contagemSubtemperamentos[a] > contagemSubtemperamentos[b] ? a : b
    );

    return { temperamento: temperamentoFinal, subtemperamento: subtemperamentoFinal };
}

// Endpoint para Receber e Salvar os Resultados

app.use((req, res, next) => {
    console.log(`📌 Requisição recebida: ${req.method} ${req.url}`);
    next();
});

app.post("/salvar-resultado", async (req, res) => {
    try {
        const { usuario_id, nome, email, telefone, data_nascimento, tempo_teste, respostas } = req.body;

        // **Verifica se os dados estão chegando corretamente**
        console.log(`📌 Nome recebido: ${nome}`);

        // **Verificação de campos obrigatórios**
        if (!usuario_id || !nome || !email || !data_nascimento || !tempo_teste || !respostas) {
            return res.status(400).json({ mensagem: "Erro: Todos os campos obrigatórios devem ser preenchidos." });
        }

        // Determinar o temperamento e subtemperamento com base nas respostas
        const { temperamento, subtemperamento } = calcularPontuacao(respostas);

        console.log(`📌 Salvando resultado para ${nome} - Temperamento: ${temperamento}, Subtemperamento: ${subtemperamento}`);

        const query = `
            INSERT INTO resultados 
            (usuario_id, nome, email, telefone, data_nascimento, tempo_teste, temperamento, subtemperamento)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `;

        const valores = [
            usuario_id, 
            Buffer.from(nome, "utf-8").toString("utf-8"),  // Garante UTF-8
            email, 
            telefone ? Buffer.from(telefone, "utf-8").toString("utf-8") : null,  
            data_nascimento, 
            tempo_teste, 
            Buffer.from(temperamento, "utf-8").toString("utf-8"),
            Buffer.from(subtemperamento, "utf-8").toString("utf-8")
        ];      

        const resultado = await pool.query(query, valores);

        res.status(201).json({ mensagem: "Resultado salvo com sucesso!", id: resultado.rows[0].id });

    } catch (error) {
        console.error("❌ Erro ao salvar resultado:", error);
        res.status(500).json({ mensagem: "Erro ao salvar resultado.", erro: error.message });
    }
});


// Rota para gerar o PDF com o template_pt.pdf
app.get("/gerar-pdf/:id", async (req, res) => {
    try {
        const { id } = req.params;

        console.log("📌 Buscando template do banco...");
        const templateResult = await pool.query("SELECT file FROM pdf_templates WHERE name = $1", ["template_pt"]);

        if (!templateResult.rows.length || !templateResult.rows[0].file) {
            console.error("🚨 Template não encontrado ou arquivo vazio!");
            return res.status(404).json({ mensagem: "Template não encontrado." });
        }

        const templateBuffer = templateResult.rows[0].file;
        console.log(`✅ Template encontrado! Tamanho do arquivo recuperado: ${templateBuffer.length} bytes`);

        // Carregar o template PDF
        const pdfDoc = await PDFDocument.load(templateBuffer);
        pdfDoc.registerFontkit(require("@pdf-lib/fontkit"));
        const pages = pdfDoc.getPages();
        const pagina1 = pages[0];

        // Carregar fonte personalizada
        const fontPath = "./arial-unicode-ms.ttf";
        if (!fs.existsSync(fontPath)) {
            throw new Error(`Fonte não encontrada: ${fontPath}`);
        }
        const fontBytes = fs.readFileSync(fontPath);
        const customFont = await pdfDoc.embedFont(fontBytes);

        console.log(`📌 Buscando dados do teste ID: ${id}`);
        const dadosResult = await pool.query("SELECT nome::TEXT, temperamento::TEXT, subtemperamento::TEXT FROM resultados WHERE id = $1", [id]);

        if (!dadosResult.rows.length) {
            console.error("🚨 Resultado não encontrado no banco!");
            return res.status(404).json({ mensagem: "Resultado não encontrado." });
        }

        console.log("✅ Dados do teste encontrados!");
        const dados = dadosResult.rows[0];

        // Ajustar a largura máxima do parágrafo
        function formatText(text, maxWidth) {
            if (typeof text !== 'string') return [];
            const words = text.split(' ');
            let lines = [];
            let currentLine = '';
            words.forEach(word => {
                if ((currentLine + word).length > maxWidth) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine += (currentLine.length ? ' ' : '') + word;
                }
            });
            if (currentLine) lines.push(currentLine);
            return lines;
        }

        console.log("📌 Adicionando informações ao PDF...");
        primeiraPagina.drawText(`Nome: ${dados.nome}`, { x: 100, y: 520, size: 14, font: customFont });
        primeiraPagina.drawText(`Temperamento: ${dados.temperamento}`, { x: 100, y: 500, size: 14, font: customFont });
        primeiraPagina.drawText(`Subtemperamento: ${dados.subtemperamento}`, { x: 100, y: 480, size: 14, font: customFont });

        console.log("📌 Salvando o novo PDF...");
        const pdfBytes = await pdfDoc.save();

        console.log("✅ PDF gerado com sucesso! Enviando para o usuário...");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=resultado.pdf");
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("🚨 Erro ao gerar PDF:", error);
        res.status(500).json({ mensagem: "Erro ao gerar PDF.", erro: error.message });
    }
});


// Iniciar o servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
