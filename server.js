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
const mysql = require("mysql2/promise");

app.use(cors({
    origin: "https://kellywaideman.com",
    methods: "GET,POST",
    allowedHeaders: "Content-Type"
}));



app.use(express.json({ limit: "10mb", type: "application/json", charset: "utf-8" }));
app.use(express.urlencoded({ extended: true }));

// Configuração do MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST,  // 🔹 Defina no .env
    user: process.env.DB_USER,  // 🔹 Usuário do banco
    password: process.env.DB_PASSWORD,  // 🔹 Senha do banco
    database: process.env.DB_NAME,  // 🔹 Nome do banco
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0

});

// Teste de conexão com o banco de dados
pool.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Erro ao conectar ao MySQL:", err);
        return;
    }
    console.log("✅ Conectado ao MySQL no HostGator!");
    connection.release(); // Libera a conexão
});

//Endpoint para salvar todos os dados de uma só vez
app.post("/salvar-resultado", async (req, res) => {
    try {
        const { nome, email, telefone, lingua_teste, data_nascimento, hora_inicio, hora_conclusao, consent_info, consent_guardar, respostas } = req.body;

        // 🔹 Verificar se todos os campos foram preenchidos corretamente
        if (!nome || !email || !data_nascimento || !hora_inicio || !hora_conclusao || !respostas) {
            console.error("❌ ERRO: Campos obrigatórios ausentes!");
            return res.status(400).json({ mensagem: "Todos os campos obrigatórios devem ser preenchidos corretamente!" });
        }

        // 🔹 Verificar se a lista de respostas contém exatamente 42 itens
        if (!Array.isArray(respostas) || respostas.length !== 42) {
            console.error("❌ ERRO: Número incorreto de respostas! Respostas recebidas:", respostas.length, respostas);
            return res.status(400).json({ mensagem: `Número incorreto de respostas. Esperado: 42, Recebido: ${respostas.length}` });
        }

        // 🔹 Garantir que data_teste esteja definida corretamente
        const data_teste = new Date().toISOString().split("T")[0];

        console.log("📌 Data do teste:", data_teste);

        // 🔹 Calcula idade corretamente
        const idade = calcularIdade(data_nascimento, data_teste);
        
        // 🔹 Calcula tempo de teste
        const tempo_teste = calcularTempoTeste(hora_inicio, hora_conclusao);
        
        // 🔹 Calcula temperamento e subtemperamento
        const { temperamento, subtemperamento } = calcularPontuacao(respostas);

        console.log("📌 Cálculos realizados:", { idade, tempo_teste, temperamento, subtemperamento });

        // 🔹 Garantir que exatamente 42 respostas sejam passadas para o banco
        const respostasCorrigidas = respostas.slice(0, 41);

        console.log("📌 Respostas corrigidas para inserção:", respostasCorrigidas.length, respostasCorrigidas);

        // 🔹 Query corrigida para garantir que o número de colunas e valores está correto
        const query = `INSERT INTO resultados 
                       (hora_inicio, hora_conclusao, nome, email, telefone, lingua_teste, data_nascimento, data_teste, idade, tempo_teste, temperamento, subtemperamento, consent_info, consent_guardar,
                        q1, q2, q3, q4, q5, q6, q7, q8, q9, q10,
                        q11, q12, q13, q14, q15, q16, q17, q18, q19, q20,
                        q21, q22, q23, q24, q25, q26, q27, q28, q29, q30,
                        q31, q32, q33, q34, q35, q36, q37, q38, q39, q40, q41, q42)
                       VALUES 
                       (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        console.log("📌 Executando query...");

        await pool.query(query, [
            hora_inicio, hora_conclusao, nome, email, telefone, lingua_teste, data_nascimento, data_teste, idade, tempo_teste, temperamento, subtemperamento, consent_info, consent_guardar,
            ...respostasCorrigidas
        ]);

        console.log("✅ Dados inseridos com sucesso!");

        res.status(201).json({ mensagem: "Resultado salvo com sucesso!" });

    } catch (error) {
        console.error("❌ Erro ao salvar resultado:", error);
        res.status(500).json({ mensagem: "Erro ao salvar resultado.", erro: error.message });
    }
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

    // Processar respostas para determinar temperatura e umidade
    respostas.slice(0, 11).forEach((resposta) => {
        if (resposta === "A") contagemTemperatura.Quente++;
        if (resposta === "B") contagemTemperatura.Frio++;
    });

    respostas.slice(11, 22).forEach((resposta) => {
        if (resposta === "A") contagemUmidade.Úmido++;
        if (resposta === "B") contagemUmidade.Seco++;
    });

    // Determinar temperamento final
    let temperaturaFinal = contagemTemperatura.Quente >= contagemTemperatura.Frio ? "Quente" : "Frio";
    let umidadeFinal = contagemUmidade.Úmido >= contagemUmidade.Seco ? "Úmido" : "Seco";

    let temperamentoFinal = "Desconhecido";
    if (temperaturaFinal === "Quente" && umidadeFinal === "Úmido") temperamentoFinal = "Sanguíneo";
    if (temperaturaFinal === "Quente" && umidadeFinal === "Seco") temperamentoFinal = "Colérico";
    if (temperaturaFinal === "Frio" && umidadeFinal === "Seco") temperamentoFinal = "Melancólico";
    if (temperaturaFinal === "Frio" && umidadeFinal === "Úmido") temperamentoFinal = "Fleumático";

    // Processar respostas para determinar subtemperamento
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

// 📌 Calcular idade com base na data de nascimento
function calcularIdade(dataNascimento, dataTeste) {
    if (!dataNascimento || !dataTeste) {
        console.error("❌ Erro: Datas inválidas fornecidas para calcularIdade. dataNascimento:", dataNascimento, "dataTeste:", dataTeste);
        return "Erro";
    }

    const nascimento = new Date(dataNascimento);
    const teste = new Date(dataTeste);

    if (isNaN(nascimento.getTime()) || isNaN(teste.getTime())) {
        console.error("❌ Erro: Formato inválido de data para calcularIdade. DataNascimento:", dataNascimento, "DataTeste:", dataTeste);
        return "Erro";
    }

    let idade = teste.getFullYear() - nascimento.getFullYear();
    const mes = teste.getMonth() - nascimento.getMonth();
    
    if (mes < 0 || (mes === 0 && teste.getDate() < nascimento.getDate())) {
        idade--;
    }

    console.log(`📌 Idade calculada corretamente: ${idade}`);
    return idade;
}

// 📌 Calcular tempo de teste
function calcularTempoTeste(horaInicio, horaConclusao) {
    if (!horaInicio || !horaConclusao) {
        console.error("❌ Erro: horaInicio ou horaConclusao estão vazios.", "Hora_Inicio:", horaInicio, "Hora_Conclusao:", horaConclusao);
        return "00:00:00"; 
    }

    try {
        const inicio = new Date(`1970-01-01T${horaInicio}Z`);
        const fim = new Date(`1970-01-01T${horaConclusao}Z`);

        if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
            throw new Error("Formato inválido de hora.");
        }

        const diferencaMs = fim - inicio;
        const segundos = Math.floor((diferencaMs / 1000) % 60);
        const minutos = Math.floor((diferencaMs / (1000 * 60)) % 60);
        const horas = Math.floor((diferencaMs / (1000 * 60 * 60)) % 24);

        return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
    } catch (error) {
        console.error("❌ Erro ao calcular tempo de teste:", error.message);
        return "00:00:00";
    }
}



// Endpoint para Receber e Salvar os Resultados

app.use((req, res, next) => {
    console.log(`📌 Requisição recebida: ${req.method} ${req.url}`);
    next();
});

app.post("/salvar-resultado", async (req, res) => {
    try {
        const { usuario_id, nome, email, telefone, data_nascimento, tempo_teste, respostas } = req.body;

        // 📌 Verificação de campos obrigatórios
        if (!usuario_id || !nome || !email || !data_nascimento || !tempo_teste || !respostas) {
            return res.status(400).json({ mensagem: "Erro: Todos os campos obrigatórios devem ser preenchidos." });
        }

        // 📌 Converter tempo do teste para string, se necessário
        const tempoTesteStr = calcularTempoTeste(dados.Hora_Inicio, dados.Hora_conclusao);
        console.log("🔍 Tempo de Teste Calculado:", tempoTesteStr);

        // 📌 Determinar o temperamento e subtemperamento com base nas respostas
        const { temperamento, subtemperamento } = calcularPontuacao(respostas);

        console.log(`📌 Salvando resultado para ${nome} - Idade: ${idade}, Tempo de Teste: ${tempoTesteStr}, Temperamento: ${temperamento}, Subtemperamento: ${subtemperamento}`);

        // 📌 Query para armazenar os dados corretamente no banco
        const query = `
            INSERT INTO resultados 
            (usuario_id, nome, email, telefone, data_nascimento, idade, tempo_teste, temperamento, subtemperamento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            ON DUPLICATE KEY UPDATE tempo_teste = VALUES(tempo_teste);
        `;

        const valores = [
            usuario_id, 
            nome, 
            email, 
            telefone || null,  
            data_nascimento, 
            idade, 
            tempoTesteStr,  
            temperamento, 
            subtemperamento
        ];

        // 📌 Executar a query no MySQL
        pool.query(query, valores, (error, results) => {
            if (error) {
                console.error("❌ Erro ao salvar resultado no MySQL:", error);
                return res.status(500).json({ mensagem: "Erro ao salvar resultado.", erro: error.message });
            }

            console.log("✅ Resultado salvo com sucesso!", results.insertId);
            res.status(201).json({ mensagem: "Resultado salvo com sucesso!", id: results.insertId });
        });

    } catch (error) {
        console.error("❌ Erro ao processar requisição:", error);
        res.status(500).json({ mensagem: "Erro interno do servidor.", erro: error.message });
    }
});


// Rota para gerar o PDF com o template_pt.pdf
app.get("/gerar-pdf/:id", async (req, res) => {
    try {
        const { id } = req.params;

        console.log("📌 Buscando template do banco...");
        const [templateResult] = await pool.query("SELECT file FROM pdf_templates WHERE name = ?", ["template_pt"]);

        if (!templateResult.length || !templateResult[0].file) {
            console.error("🚨 Template não encontrado ou arquivo vazio!");
            return res.status(404).json({ mensagem: "Template não encontrado." });
        }

        const templateBuffer = templateResult[0].file;
        console.log(`✅ Template encontrado! Tamanho do arquivo recuperado: ${templateBuffer.length} bytes`);

        // Carregar o template PDF
        let pdfDoc = await PDFDocument.load(templateBuffer);
        pdfDoc.registerFontkit(require("@pdf-lib/fontkit"));
        let pages = pdfDoc.getPages();
        let pagina1 = pages[0];

        // Carregar fonte personalizada
        const fontPath = "./arial-unicode-ms.ttf";
        if (!fs.existsSync(fontPath)) {
            throw new Error(`Fonte não encontrada: ${fontPath}`);
        }
        const fontBytes = fs.readFileSync(fontPath);
        const customFont = await pdfDoc.embedFont(fontBytes);

        console.log(`📌 Buscando dados do teste ID: ${id}`);
        const [rows] = await pool.query("SELECT * FROM resultados WHERE id = ?", [id]);
        const dados = rows.length > 0 ? rows[0] : null;
        console.log("🔍 Dados extraídos do banco:", dados);

        if (!dados || Object.keys(dados).length === 0) {
            console.error("❌ Nenhum resultado encontrado.");
            return res.status(404).json({ mensagem: "Nenhum resultado encontrado." });
        }
        
        console.log("✅ Dados do teste encontrados!");
                      
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
            let graficoImage = await pdfDoc.embedPng(graficoBuffer);

            // Definir posição e tamanho da imagem no PDF
            pagina1.drawImage(graficoImage, {
                x: 92, // Ajuste conforme necessário
                y: 500, // Ajuste conforme necessário
                width: 155,
                height: 155
            });
        
                        
        // Ajustar a largura máxima do parágrafo
        function formatText(text, maxWidth) {
            if (typeof text !== "string") {
                console.error("❌ Erro: text não é uma string em formatText(). Valor recebido:", text);
                return ["Erro ao processar texto"];
            }
        
            let lines = [];
            let paragraphs = text.replace(/\r/g, "").split("\n"); // 🔹 Garante que '\n' seja respeitado
        
            paragraphs.forEach(paragraph => {
                let words = paragraph.split(" ");
                let currentLine = "";
        
                words.forEach(word => {
                    if ((currentLine + " " + word).trim().length > maxWidth) {
                        lines.push(currentLine.trim());
                        currentLine = word;
                    } else {
                        currentLine += (currentLine.length ? " " : "") + word;
                    }
                });
        
                lines.push(currentLine.trim());
                lines.push(""); // 🔹 Adiciona uma linha vazia para separar parágrafos corretamente
            });
        
            return lines;
        }
                                                
        // Buscar detalhes do temperamento e formatar detalhes
        const [tempRows] = await pool.query(
            "SELECT descricao, comportamento, positivo, atencao, desafio, sugestao FROM temperamentos WHERE temperamento = ?", 
            [dados.temperamento]
        );
        
        if (!Array.isArray(tempRows) || tempRows.length === 0) {
            console.error("⚠ Nenhum resultado encontrado para o temperamento:", dados.temperamento);
        }
        // 🔹 Mantendo quebras de parágrafo corretamente antes de enviar ao PDF
        let descricaoTemperamento = tempRows.map(row => row.descricao || "Não disponível");
        let comportamento = tempRows.map(row => row.comportamento || "Não disponível");
        let pontosPositivos = tempRows.map(row => row.positivo || "Não disponível");
        let pontosAtencao = tempRows.map(row => row.atencao || "Não disponível");
        let desafio = tempRows.map(row => row.desafio || "Não disponível");
        let sugestao = tempRows.map(row => row.sugestao || "Não disponível");
        let idade = calcularIdade(dados.data_nascimento, dados.data_teste);
        let tempoTesteStr = calcularTempoTeste(dados.Hora_Inicio, dados.Hora_conclusao);

        console.log("🔍 Tempo de Teste Calculado:", tempoTesteStr);
        console.log("🔍 Idade Calculada:", idade);
        console.log("🔍 Dados do usuário:", dados);
        console.log("🔍 Temperamento recebido:", dados.temperamento);
        console.log("🔍 Subtemperamento recebido:", dados.subtemperamento);
        console.log("🔍 Tempo de Teste:", dados.tempo_teste);
        console.log("🔍 Idade Calculada:", calcularIdade(dados.data_nascimento, dados.data_teste));

        // Buscar detalhes do subtemperamento e formatar detalhes
        const [subTempResult] = await pool.query(
            "SELECT descricao FROM subtemperamentos WHERE subtemperamento = ?", 
            [dados.subtemperamento]
        );

        if (!Array.isArray(subTempResult) || subTempResult.length === 0) {
            console.error("⚠ Nenhum resultado encontrado para o temperamento:", dados.subtemperamento);
        }
        
        // Garantir que subTempData sempre tenha um valor válido
        const subTempData = subTempResult.length > 0 ? subTempResult[0] : { descricao: "Não disponível" };
        console.log("🔍 subTempData Final:", subTempData);      


        // Garantir que descricaoSubtemperamento seja uma string válida antes de formatar
        let descricaoSubtemperamento = subTempResult.map(row => row.descricao || "Não disponível");
        console.log("🔍 Descrição do Subtemperamento:", subTempData.descricao);
     

        // Buscar personagens relacionados ao temperamento  e formatar detalhes
        let [personagensRaw] = await pool.query(
            "SELECT descricao FROM personagens WHERE temperamento = ? LIMIT 3", 
            [dados.temperamento]
        );
        
        let personagens = personagensRaw.flat().map(row => row.descricao || "Personagem não disponível");
        
        console.log("🔍 Personagens Corrigidos:", personagens);
        console.log("🔍 Personagens extraídos:", personagens);
        console.log("📌 Adicionando informações ao PDF...");
    

        // Ajustar formato da data para dia/mês/ano
        const dataFormatada = new Date(dados.data_teste).toLocaleDateString('pt-BR');
        const nascimentoFormatada = new Date(dados.data_nascimento).toLocaleDateString('pt-BR');


        // Função para adicionar texto com quebra de página
        function addTextWithPageBreak(page, textArray, startX, startY, pageLimit, pdfDoc, font, fontSize = 10) {
            let yOffset = startY;
        
            textArray.forEach((line, index) => {
                if (yOffset < pageLimit) {
                    // Criar nova página se o espaço acabar
                    page = pdfDoc.addPage([612, 792]); // Formato Letter
                    yOffset = 750; // Resetar a posição no topo da nova página
                }
        
                if (line.trim() === "") {
                    yOffset -= 2; // 🔹 Espaçamento maior para parágrafos
                } else {
                    page.drawText(line, { x: startX, y: yOffset, size: fontSize, font });
                    yOffset -= 13; // 🔹 Mantém o espaçamento normal entre linhas
                }
            });
        
            return page; // Retorna a última página usada
        }
                

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

        // Página 1 - Descricao do Temperamento
            // Titulo do temperamento
            pagina1.drawText(`Descrição do Temperamento ${dados.temperamento}`, { x: 185, y: 495, size: 14, font: customFont });

            // Adicionar texto formatado descricao temperamento
            descricaoTemperamento = formatText(String(descricaoTemperamento || "Não disponível"), 113);
            pagina1 = addTextWithPageBreak(pagina1, descricaoTemperamento, 35, 475, 35, pdfDoc, customFont);

            // Página 2 - Descrição do Subtemperamento e comportamento
            let pagina2 = pages[1];
            //  TITULO SUBTEMPERAMENTO
            pagina2.drawText(`Características do Subtemperamento ${dados.subtemperamento}`, { x: 173, y: 707, size: 14, font: customFont });

            // Adicionar texto formatado DESCRICAO SUBTEMPERAMENTO
            descricaoSubtemperamento = formatText(String(descricaoSubtemperamento || "Não disponível"), 113);
            pagina2 = addTextWithPageBreak(pagina2, descricaoSubtemperamento, 35, 695, 35, pdfDoc, customFont);


            // Adicionar texto formatado COMPORTAMENTO
            comportamento = formatText(String(comportamento || "Não disponível"), 113);
            pagina2 = addTextWithPageBreak(pagina2, comportamento, 35, 382, 35, pdfDoc, customFont);
            

        // Página 3 - Descrição do pontos positivo e de atenção
            let pagina3 = pages[2];
            // Adicionar texto formatado Pontos Positivos
            pontosPositivos = formatText(String(pontosPositivos || "Não disponível"), 113);
            pagina3 = addTextWithPageBreak(pagina3, pontosPositivos, 35, 695, 35, pdfDoc, customFont);

            // Adicionar texto formatado das Atencoes
            pontosAtencao = formatText(String(pontosAtencao || "Não disponível"), 113);
            pagina3 = addTextWithPageBreak(pagina3, pontosAtencao, 35, 385, 35, pdfDoc, customFont);
        

        // Página 4 - Descrição do Subtemperamento e comportamento
            let pagina4 = pages[3];
            // Adicionar texto formatado dos Desafios
            desafio = formatText(String(desafio || "Não disponível"), 113);
            pagina4 = addTextWithPageBreak(pagina4, desafio, 35, 692, 35, pdfDoc, customFont);

            // Adicionar texto formatado Sugestoes
            sugestao = formatText(String(sugestao || "Não disponível"), 113);
            pagina4 = addTextWithPageBreak(pagina4, sugestao, 35, 385, 35, pdfDoc, customFont);


        // Página 5 - Personagens Relacionados
            let pagina5 = pages[4];
            // Adicionar texto formatado Personagens
            personagens = formatText(String(personagens || "Não disponível"), 113);
            pagina5 = addTextWithPageBreak(pagina5, personagens, 35, 685, 35, pdfDoc, customFont);
        
        console.log("🔍 Descrição do Subtemperamento:", descricaoSubtemperamento);
        console.log("🔍 Lado Positivo:", pontosPositivos);
        console.log("🔍 Pontos de Atenção:", pontosAtencao);
        console.log("🔍 Personagens Extraídos:", personagens);
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
