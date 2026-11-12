import mysql from 'mysql2/promise';
import { DB } from './db.js';

if (process.env.RENDER || process.env.MYSQL_URL || process.env.DATABASE_URL) {
  console.error('\nReset is disabled for hosted databases.');
  console.error('Recreate or empty the database from your hosting provider instead.');
  process.exit(1);
}

try {
  const connection = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
  });
  await connection.query(`DROP DATABASE IF EXISTS \`${DB.database}\``);
  await connection.query(
    `CREATE DATABASE \`${DB.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
  console.log(
    `Database "${DB.database}" was emptied. Run "npm start" to recreate the tables with fresh demo data.`
  );
} catch (error) {
  console.error('\nCould not reset the MySQL database.');
  console.error(`  Target: ${DB.user}@${DB.host}:${DB.port}/${DB.database}`);
  console.error('  Start MySQL in Laragon first, then run "npm run reset" again.');
  console.error(`  Details: ${error.message}\n`);
  process.exit(1);
}
