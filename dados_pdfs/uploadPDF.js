const mysql = require("mysql2/promise");
const fs = require("fs");

const pool = mysql.createPool({
  host: "br996.hostgator.com.br",
  user: "kellyw28_mpspinetti",
  password: "Jaburu@123",
  database: "kellyw28_TTemperamento",
  waitForConnections: true,
  connectionLimit: 10
});

async function importarPDF() {
  try {
    const fileData = fs.readFileSync("template_pt.pdf"); // Lê o arquivo PDF
    const query = "INSERT INTO pdf_templates (name, file) VALUES (?, ?)";
    const valores = ["template_pt", fileData];

    const conn = await pool.getConnection();
    await conn.query(query, valores);
    conn.release();

    console.log("✅ PDF importado com sucesso no MySQL!");
  } catch (error) {
    console.error("❌ Erro ao importar PDF:", error);
  }
}

importarPDF();
