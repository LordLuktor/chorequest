import knex from 'knex';
import fs from 'fs';

function getPassword(): string {
  // Docker secrets take precedence
  const secretPath = '/run/secrets/chorequest_db_password';
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  return process.env.DB_PASSWORD || '';
}

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'chorequest',
    user: process.env.DB_USER || 'chorequest',
    password: getPassword(),
  },
  pool: { min: 2, max: 10 },
});

export default db;
