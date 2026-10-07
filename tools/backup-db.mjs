import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
const target=process.argv[2];if(!target)throw new Error('Usage: node tools/backup-db.mjs /absolute/path/backup.sqlite');
const source=process.env.RAMNOOR_DB_PATH||path.resolve('var/dashboard.sqlite');if(!fs.existsSync(source))throw new Error('Database does not exist.');if(path.resolve(source)===path.resolve(target))throw new Error('Source and destination must differ.');
const db=new DatabaseSync(source);db.exec("VACUUM INTO '"+path.resolve(target).replaceAll("'","''")+"'");db.close();console.log('Database backup saved.');
