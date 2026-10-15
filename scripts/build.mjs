import fs from 'node:fs/promises';
import { build } from 'esbuild';
await fs.mkdir('dist',{recursive:true});
for(const name of ['index.html','style.css','shell.css','app.js','transport.js','sw.js','icon-192.png','icon-512.png']) await fs.copyFile('web/'+name,'dist/'+name);
await fs.copyFile('shared/logic.js','dist/logic.js');
await fs.copyFile('shared/logic.js','backend/Shared.gs');
await build({entryPoints:['web/native-entry.js'],bundle:true,format:'iife',outfile:'dist/native.js',target:'es2020'});
console.log('Built plain HTML/CSS/JS assets and identical Apps Script Shared.gs.');
