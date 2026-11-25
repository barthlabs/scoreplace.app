'use strict';
// Mesmo HTML da página; sem navegador pessoal, rede externa ou dados reais.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1366,height:1000}});
 await page.route(/^https?:/,r=>r.abort());
 await page.goto(pathToFileURL(root+'/assets/regulamento-cult-2026.html').href);
 await page.evaluate(()=>document.fonts.ready);
 await page.emulateMedia({media:'print'});
 await page.pdf({path:root+'/assets/regulamento-cult-2026.pdf',format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
 const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(root+'/assets/'+f)).digest('hex');
 fs.writeFileSync(root+'/assets/regulamento-cult-2026.manifest.json',JSON.stringify({htmlSha256:sha('regulamento-cult-2026.html'),pdfSha256:sha('regulamento-cult-2026.pdf')},null,2)+'\n');
 console.log('PDF CULT gerado do HTML; hashes registrados.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
