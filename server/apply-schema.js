import dotenv from "dotenv";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: "server/.env" });

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function applySchema() {
    try {
        const schemaPath = path.join(__dirname, "schema.sql");

        const schema = fs.readFileSync(schemaPath, "utf8");

        await pool.query(schema);

        console.log("SecureVault database schema created successfully!");

    } catch (error) {
        console.error("Schema creation failed:", error.message);

    } finally {
        await pool.end();
    }
}

applySchema();