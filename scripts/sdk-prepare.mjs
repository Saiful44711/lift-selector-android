import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
function warn(s){console.log('::warning::'+s);}
function run(cmd,args,quietSuccess=false){const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;if(proxy){const u=new URL(proxy);if(u.username||u.password)throw new Error('Authenticated SDK proxy requires explicit environment setup; credentials are not put in command arguments.');args=args.concat(['--proxy=http','--proxy_host='+u.hostname,'--proxy_port='+(u.port||80)]);}const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:20*1024*1024});if(r.stdout&&(!quietSuccess||r.status!==0))process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)throw new Error(cmd+' failed with exit '+r.status);return r.stdout;}
try{
 const vars=fs.readFileSync('android/variables.gradle','utf8');
 const sdk=Number((vars.match(/compileSdkVersion\s*=\s*(\d+)/)||[])[1]);if(!sdk)throw new Error('Cannot read compileSdkVersion from generated android/variables.gradle.');
 const home=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;if(!home)throw new Error('ANDROID_HOME/ANDROID_SDK_ROOT is not set. Use a GitHub-hosted Ubuntu runner with Android SDK.');
 const candidates=[path.join(home,'cmdline-tools/latest/bin/sdkmanager'),...fs.readdirSync(path.join(home,'cmdline-tools')).map(x=>path.join(home,'cmdline-tools',x,'bin/sdkmanager'))];
 const manager=candidates.find(x=>fs.existsSync(x));if(!manager)throw new Error('sdkmanager is missing under '+home+'/cmdline-tools.');
 const listing=run(manager,['--sdk_root='+home,'--list'],true);
 const platform='platforms;android-'+sdk;
 if(!listing.includes(platform))throw new Error('Generated project requires '+platform+', but sdkmanager does not list it. Check Android repository/network access.');
 if(!fs.existsSync(path.join(home,'platforms','android-'+sdk,'android.jar')))run(manager,['--sdk_root='+home,platform]);
 // Use an explicit generated-project buildToolsVersion if present; otherwise let AGP choose.
 const project=fs.readFileSync('android/app/build.gradle','utf8');const required=(project.match(/buildToolsVersion\s*(?:=\s*)?['"]([^'"]+)['"]/)||[])[1];
 if(required){if(listing.includes('build-tools;'+required)){run(manager,['--sdk_root='+home,'build-tools;'+required]);}else{warn('Explicit build tools '+required+' unavailable; removing that override so Android Gradle Plugin selects its supported tools.');fs.writeFileSync('android/app/build.gradle',project.replace(/buildToolsVersion\s*(?:=\s*)?['"][^'"]+['"]/,'// build tools selected by AGP'));}}
 else console.log('No build-tools version hard-coded: Android Gradle Plugin selects its requirement.');
 const installed=fs.existsSync(path.join(home,'build-tools'))?fs.readdirSync(path.join(home,'build-tools')).filter(x=>/^\d+\.\d+\.\d+$/.test(x)):[];
 if(!installed.length){const available=[...listing.matchAll(/build-tools;(\d+\.\d+\.\d+)\s/g)].map(m=>m[1]);available.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));if(!available.length)throw new Error('No stable build-tools package available.');warn('No installed build tools; installing the newest advertised stable package. AGP may install its own compatible requirement.');run(manager,['--sdk_root='+home,'build-tools;'+available.at(-1)]);}
 fs.writeFileSync('android/local.properties','sdk.dir='+home.replaceAll('\\','\\\\')+'\n');
 console.log('SDK readiness verified against generated compile SDK '+sdk+'.');
}catch(err){console.error('SDK SETUP FAILED:',err.message);process.exitCode=1;}
