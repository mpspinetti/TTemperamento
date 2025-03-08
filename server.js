require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const { PDFDocument } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const sharp = require("sharp");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express(); 

app.use(cors({
    origin: "https://kellywaideman.com", // Altere para seu domínio real
    methods: "GET,POST",
    allowedHeaders: "Content-Type"
}));



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

        // Converter tempo_teste para string, se não for
        const tempoTesteStr = typeof tempo_teste === 'string' ? tempo_teste : JSON.stringify(tempo_teste);
        
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
            tempoTesteStr, 
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

        // Função para calcular a idade com base na data de nascimento
        function calcularIdade(dataNascimento) {
        const hoje = new Date();
        const nascimento = new Date(dataNascimento);
        let idade = hoje.getFullYear() - nascimento.getFullYear();
        const mes = hoje.getMonth() - nascimento.getMonth();
        if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
    }
    return idade;
}

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
        const dadosResult = await pool.query("SELECT * FROM resultados WHERE id = $1", [id]);

        if (!dadosResult.rows.length) {
            console.error("🚨 Resultado não encontrado no banco!");
            return res.status(404).json({ mensagem: "Resultado não encontrado." });
        }

        console.log("✅ Dados do teste encontrados!");
        const dados = dadosResult.rows[0];
                      
        // 🔹 Torne a função assíncrona adicionando `async`
        async function gerarGraficoPonteiro(angleIndex) {
             const angles = [10, 45, 80, 100, 135, 170, 190, 225, 260, 290, 315, 350];
             const currentAngle = angles[angleIndex] || 10;

            
        // 🔹 Definição das dimensões da imagem
        const width = 200;  // ✅ Corrigindo o erro "width is not defined"
        const height = 200; // ✅ Garantindo que "height" também está definido
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 80;

        // 🔹 Calcular coordenadas do ponteiro do relógio
        const radian = (Math.PI / 180) * (currentAngle - 90);
        const xEnd = Math.round(centerX + Math.cos(radian) * radius);
        const yEnd = Math.round(centerY + Math.sin(radian) * radius);

        // Criar um SVG para o gráfico do ponteiro do relógio
        const svg = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="none"/>
                <line x1="${centerX}" y1="${centerY}" x2="${xEnd}" y2="${yEnd}" stroke="black" stroke-width="2"/>
            </svg>
        `;

        try {
            // Converter o SVG em PNG usando Sharp e retornar como Buffer
            const pngBuffer = await sharp(Buffer.from(svg))
                .png({ alphaQuality: 100 })  // 🔹 Mantém transparência
                .toBuffer();

        return pngBuffer;
    } catch (error) {
        console.error("🚨 Erro ao gerar gráfico do ponteiro:", error);
        throw new Error("Falha ao gerar gráfico do ponteiro.");
    }
}        
        // Converter subtemperamento para índice de gráfico
        const subTemperamentoIndex = {
        "Faisca": 0, "Fogo": 1, "Brasa": 2,  
        "Pedra": 3, "Terra": 4, "Argila": 5,  
        "Gelo": 6, "Água": 7, "Vapor": 8,  
        "Brisa": 9, "Ar": 10, "Vento": 11  
        }[dados.subtemperamento] || 0;

            
            // Gerar o gráfico
            const graficoBuffer = await gerarGraficoPonteiro(subTemperamentoIndex);
            if (!graficoBuffer || !(graficoBuffer instanceof Uint8Array)) {
                throw new Error("❌ Erro: Buffer da imagem inválido.");
            }
            const graficoImage = await pdfDoc.embedPng(graficoBuffer);

            // Definir posição e tamanho da imagem no PDF
            pagina1.drawImage(graficoImage, {
                x: 92, // Ajuste conforme necessário
                y: 500, // Ajuste conforme necessário
                width: 155,
                height: 155
            });
        
                        
        // Ajustar a largura máxima do parágrafo
        function formatText(text, maxWidth) {
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
            lines.push(currentLine);
            return lines;
        }
                
        // Buscar detalhes do temperamento e formatar detalhes
        const tempResult = await pool.query("SELECT descricao, comportamento, positivo, atencao, desafio, sugestao FROM temperamentos WHERE temperamento = $1", [dados.temperamento]);
        const tempData = tempResult.rows[0] || {};
        const descricaoTemperamento = formatText(tempData.descricao || "Não disponível", 110);
        const comportamento = formatText(tempData.comportamento || "Não disponível", 110);   
        const pontosPositivos = formatText(tempData.positivo || "Não disponível", 110);
        const pontosAtencao = formatText(tempData.atencao || "Não disponível", 110);   
        const desafio = formatText(tempData.desafio || "Não disponível", 110);   
        const sugestao = formatText(tempData.sugestao || "Não disponível", 110);  
        const idade = calcularIdade(dados.data_nascimento); 
        const tempoTesteStr = dados.tempo_teste.toISOString();

        // Buscar detalhes do subtemperamento e formatar detalhes
        const subTempResult = await pool.query("SELECT descricao FROM subtemperamentos WHERE subtemperamento = $1", [dados.subtemperamento]);
        const subTempData = subTempResult.rows[0] || {};
        const descricaoSubtemperamento = formatText(subTempData.descricao || "Não disponível", 110);
        

        // Buscar personagens relacionados ao temperamento  e formatar detalhes
        const personagensResult = await pool.query("SELECT descricao FROM personagens WHERE temperamento = $1 LIMIT 3", [dados.temperamento]);
        const personagens = personagensResult.rows.map(row => formatText(row.descricao || "Não disponível", 110));        

        console.log("📌 Adicionando informações ao PDF...");

        // Ajustar formato da data para dia/mês/ano
        const dataFormatada = new Date(dados.data_teste).toLocaleDateString('pt-BR');
        const nascimentoFormatada = new Date(dados.data_nascimento).toLocaleDateString('pt-BR');


        // Página 1 - Informações principais
        pagina1.drawText(`${dados.id}`, { x: 70, y: 690, size: 14, font: customFont });
        pagina1.drawText(`${dados.nome}`, { x: 155, y: 690, size: 14, font: customFont });
        pagina1.drawText(`${nascimentoFormatada}`, { x: 150, y: 677, size: 10, font: customFont }); //data_nascimento
        pagina1.drawText(`${idade}`, { x: 390, y: 677, size: 10, font: customFont });
        pagina1.drawText(`${dataFormatada}`, { x: 150, y: 665, size: 10, font: customFont }); // data_teste
        pagina1.drawText(`${dados.telefone || "Não informado"}`, { x: 390, y: 665, size: 10, font: customFont });
        pagina1.drawText(`${tempoTesteStr}`, { x: 150, y: 654, size: 10, font: customFont });
        pagina1.drawText(`${dados.email}`, { x: 390, y: 654, size: 10, font: customFont });
        pagina1.drawText(`${dados.temperamento}`, { x: 420, y: 595, size: 10, font: customFont });
        pagina1.drawText(`${dados.subtemperamento}`, { x: 420, y: 571, size: 10, font: customFont });

        // Página 1 - Descrição do temperamento
        pagina1.drawText(`Descrição do Temperamento ${dados.temperamento}`, { x: 185, y: 495, size: 14, font: customFont });
        //pagina1.drawText(`${tempData.descricao}`, { x: 38, y: 462, size: 10, font: customFont });

        // Adicionar texto formatado
        let yOffset = 495;
        descricaoTemperamento.forEach(line => {
        pagina1.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
       });

        // Página 2 - Descrição do Subtemperamento e comportamento
        const pagina2 = pages[1];
        pagina2.drawText(`Características do Subtemperamento ${dados.subtemperamento}`, { x: 173, y: 707, size: 14, font: customFont });
        //pagina2.drawText(`${subTempData.descricao}`, { x: 38, y: 680, size: 10, font: customFont });
        //pagina2.drawText(`${subTempData.comportamento}`, { x: 38, y: 370, size: 10, font: customFont });

        // Adicionar texto formatado
        yOffset = 680;
        descricaoSubtemperamento.forEach(line => {
        pagina2.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });

        // Adicionar texto formatado
        yOffset = 370;
        comportamento.forEach(line => {
        pagina2.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });

        // Página 3 - Descrição do pontos positivo e de atenção
        const pagina3 = pages[2];
        //pagina3.drawText(`${subTempData.positivo}`, { x: 38, y: 680, size: 10, font: customFont });
        //pagina3.drawText(`${subTempData.atencao}`, { x: 38, y: 370, size: 10, font: customFont });

        // Adicionar texto formatado
        yOffset = 680;
        pontosPositivos.forEach(line => {
        pagina3.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });
        // Adicionar texto formatado
        yOffset = 370;
        pontosAtencao.forEach(line => {
        pagina3.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });

        // Página 4 - Descrição do Subtemperamento e comportamento
        const pagina4 = pages[3];
        //pagina4.drawText(`${subTempData.desafio}`, { x: 38, y: 680, size: 10, font: customFont });
        //pagina4.drawText(`${subTempData.sugestao}`, { x: 38, y: 370, size: 10, font: customFont });

        // Adicionar texto formatado
        yOffset = 680;
        desafio.forEach(line => {
        pagina4.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });

        // Adicionar texto formatado
        yOffset = 370;
        sugestao.forEach(line => {
        pagina4.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });
        
        // Página 5 - Personagens Relacionados
        const pagina5 = pages[4];

        // Adicionar texto formatado
        yOffset = 680;
        personagens.forEach(line => {
        pagina5.drawText(line.toString(), { x: 50, y: yOffset, size: 10, font: customFont });
        yOffset -= 12;
        });
     
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
