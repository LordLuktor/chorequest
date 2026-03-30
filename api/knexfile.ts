import type { Knex } from 'knex';

const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'chorequest',
    user: process.env.DB_USER || 'chorequest',
    password: process.env.DB_PASSWORD || '',
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  pool: {
    min: 2,
    max: 10,
  },
};

export default config;
