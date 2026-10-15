import fs from 'node:fs/promises';
import { build } from 'esbuild';
await fs.mkdir('dist',{recursive:true});
for(const name of ['index.html','style.css','shell.css','app.js','transport.js','sw.js','icon-192.png','icon-512.png','company-logo.png','app-icon.svg']) await fs.copyFile('web/'+name,'dist/'+name);
await fs.copyFile('shared/logic.js','dist/logic.js');
await fs.copyFile('shared/ui-helpers.js','dist/ui-helpers.js');
await fs.copyFile('shared/logic.js','backend/Shared.gs');
await build({entryPoints:['web/native-entry.js'],bundle:true,format:'iife',outfile:'dist/native.js',target:'es2020'});
console.log('Built plain HTML/CSS/JS assets and identical Apps Script Shared.gs.');

const companyLogo=await fs.readFile('web/company-logo.png');
const logic=await fs.readFile('shared/logic.js','utf8');
const helpers=await fs.readFile('shared/ui-helpers.js','utf8');
await fs.writeFile('backend/ClientCore.html','<script>\nvar COMPANY_LOGO_URL="data:image/png;base64,'+companyLogo.toString('base64')+'";\n'+logic+'\n'+helpers+'\ndocument.addEventListener("DOMContentLoaded",function(){document.querySelectorAll("[data-company-logo]").forEach(function(img){img.src=COMPANY_LOGO_URL;});});\n</script>\n');
console.log('Built WLF branding and shared local-calculation adapter for Apps Script.');
