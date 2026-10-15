import fs from 'node:fs/promises';
const fixture=await fs.readFile('tests/demo-fixture.cjs','utf8');
const match=fixture.match(/vm\.runInContext\(("(?:\\.|[^"\\])*"),context\)/s);if(!match)throw Error('Preview fixture could not be read');
const sample=JSON.parse(match[1]);
const bridge=`<script>
function readStore(k,fallback){return fallback;}function writeStore(){}
${sample}
function previewCall(action,args){
 var result=demoCall(action,args);
 if(['login','getSession','refreshIndex'].indexOf(action)>=0){var token=result.token||args[0];result.componentDetails={};demoIndex().forEach(function(row){result.componentDetails[row.r]=demoCall('getComponentDetails',[token,row.r]);});}
 return result;
}
function previewRunner(){var ok=function(){},bad=function(){},runner;runner=new Proxy({}, {get:function(t,k){if(k==='withSuccessHandler')return function(fn){ok=fn;return runner;};if(k==='withFailureHandler')return function(fn){bad=fn;return runner;};return function(){var args=Array.from(arguments);Promise.resolve().then(function(){return previewCall(k,args);}).then(ok).catch(bad);};}});return runner;}
var google={script:{get run(){return previewRunner();}}};
</script>`;
let html=await fs.readFile('backend/Index.html','utf8');
const includes=[...html.matchAll(/<\?!= include\('([^']+)'\); \?>/g)];for(const match of includes)html=html.replace(match[0],await fs.readFile('backend/'+match[1]+'.html','utf8'));
html=html.replace('</head>',bridge+'<style>body{padding-top:42px}.preview-banner{position:fixed;top:0;left:0;right:0;z-index:1000;background:#fff0da;color:#633900;padding:8px 12px;text-align:center;font:12px/1.4 system-ui}.preview-banner b{color:#9b2200}@media print{.preview-banner{display:none}}</style></head>');
html=html.replace('<body>','<body><div class="preview-banner"><b>FICTIONAL OFFLINE PREVIEW</b> · full@example.test / DemoPass123 · No real Sheet connection</div>');
await fs.writeFile('PREVIEW.html',html);console.log('Created standalone fictional PREVIEW.html; no external API calls.');
